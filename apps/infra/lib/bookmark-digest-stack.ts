/**
 * bookmark-digest-stack.ts — Phase-0 + Phase-1 monolithic CDK stack.
 *
 * Phase-0 (legacy):
 *   Cognito (auth) → API Gateway → Lambda (accept URL, placeholder)
 *   → Step Functions (received → processing → done)
 *
 * Phase-1 (current):
 *   DynamoDB Tables (Sources + Digests) for persistent storage
 *   ingest-url Lambda → dedup + Firecrawl fetch → DynamoDB Sources
 *   embed-source Lambda → triggered via DynamoDB Stream → Bedrock embedding → DynamoDB Sources
 *   generate-digest Lambda → Gemini → json-render Spec tree → DynamoDB Digests
 *   API Gateway routes: /sources, /digest-goals, /digests
 *
 * NOTE: Aurora has been replaced by DynamoDB (see plans/dynamodb-migration.md).
 * No manual provisioning, no VPC, no secrets — tables are fully CDK-managed.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { StartingPosition, FilterRule, FilterCriteria } from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { SqsDlq } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as lambdaEvents from "aws-cdk-lib/aws-lambda-event-sources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as config from "./config";

// ---------------------------------------------------------------------------
// Type definitions for API responses
// ---------------------------------------------------------------------------

export interface IngestUrlResponse {
  sourceHash: string;
  status: "new" | "existing";
}

export interface FetchSourceResponse {
  sourceHash: string;
  url: string;
  content?: string | null;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

export interface FetchDigestResponse {
  id: string;
  sourceHash: string;
  digestGoal: string;
  status: string;
  output: unknown[] | null;
  error: string | null;
  model: string | null;
  createdAt: string;
  completedAt: string | null;
}

export class BookmarkDigest extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "bookmark-digest-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      authFlows: { userSrp: true },
      generateSecret: false,
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, "ApiAuthorizer", {
      cognitoUserPools: [userPool],
    });

    const api = new apigw.RestApi(this, "BookmarkApi", {
      restApiName: "bookmark-digest-api",
      deployOptions: { stageName: "dev" },
    });

    // =====================================================================
    // Phase-1: DynamoDB Tables
    // =====================================================================

    const sourcesTable = new dynamodb.TableV2(this, "SourcesTable", {
      partitionKey: { name: "contentHash", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
    });
    sourcesTable.addGlobalSecondaryIndex({
      indexName: "UrlIndex",
      partitionKey: { name: "url", type: dynamodb.AttributeType.STRING },
    });

    const digestsTable = new dynamodb.TableV2(this, "DigestsTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    digestsTable.addGlobalSecondaryIndex({
      indexName: "SourceHashIndex",
      partitionKey: { name: "sourceHash", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "digestGoal", type: dynamodb.AttributeType.STRING },
    });

    // =====================================================================
    // Phase-1: Lambda functions
    // =====================================================================

    // ingest-url: accept URL, fetch content, dedup, store in DynamoDB
    const ingestUrlFn = new lambdaNodejs.NodejsFunction(this, "IngestUrlFunction", {
      entry: "lambdas/ingest-url/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(5),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY ?? "",
        FIRECRAWL_API_URL: config.FIRECRAWL_API_URL,
      },
    });

    sourcesTable.grantReadWriteData(ingestUrlFn);

    // embed-source: triggered via DynamoDB Stream on SourcesTable (NEW_IMAGE)
    // No direct invoke needed — the stream handles delivery automatically.
    const embedSourceFn = new lambdaNodejs.NodejsFunction(this, "EmbedSourceFunction", {
      entry: "lambdas/embed-source/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(15),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
        BEDROCK_EMBEDDING_MODEL: config.BEDROCK_EMBEDDING_MODEL_ID,
        BEDROCK_EMBEDDING_DIMENSIONS: String(config.BEDROCK_EMBEDDING_DIMENSIONS),
      },
    });

    embedSourceFn.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          config.BEDROCK_EMBEDDING_MODEL_ARN,
        ],
      })
    );

    // DynamoEventSource only grants stream-read actions (GetRecords, etc.) —
    // it does not grant table access, which the handler needs for UpdateItem.
    sourcesTable.grantReadWriteData(embedSourceFn);

    // embed-source DLQ — captures batch-level failures that Lambda can't retry
    const embedDlq = new sqs.Queue(this, "EmbedDlq", {
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // Wire embed-source as DynamoDB Stream consumer on SourcesTable
    embedSourceFn.addEventSource(new lambdaEventSources.DynamoEventSource(sourcesTable, {
      startingPosition: StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 0, // no auto-retry; batch-level failures go to DLQ
      filters: [
        FilterCriteria.filter({
          eventName: FilterRule.isEqual("INSERT"),
        }),
      ],
      onFailure: new SqsDlq(embedDlq),
    }));

    // Personal Gemini API key — created out-of-band (not by this stack) so the
    // key never enters the CloudFormation template or cdk.out assets.
    const geminiApiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "GeminiApiKeySecret",
      config.GEMINI_API_KEY_SECRET_NAME
    );

    // generate-digest-worker: does the actual Gemini call + validation, single attempt.
    // Not exposed via API Gateway — invoked asynchronously by generateDigestFn
    // below, so it's free of API Gateway's 29s integration timeout.
    const generateDigestWorkerFn = new lambdaNodejs.NodejsFunction(this, "GenerateDigestWorkerFunction", {
      entry: "lambdas/generate-digest/handler.ts",
      handler: "workerHandler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(10),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
        DIGESTS_TABLE_NAME: digestsTable.tableName,
        GEMINI_MODEL: config.GEMINI_MODEL_ID,
        GEMINI_API_KEY_SECRET_ARN: geminiApiKeySecret.secretArn,
        DIGEST_MAX_TOKENS: String(config.DIGEST_MAX_TOKENS),
        BEDROCK_HAIKU_INFERENCE_PROFILE_ID: config.BEDROCK_HAIKU_INFERENCE_PROFILE_ID,
        CATALOG_VERSION: "0.0.0",
      },
    });

    sourcesTable.grantReadData(generateDigestWorkerFn);
    digestsTable.grantReadWriteData(generateDigestWorkerFn);
    geminiApiKeySecret.grantRead(generateDigestWorkerFn);

    // Bedrock Claude Haiku fallback — used when the Gemini free-tier quota
    // is exhausted. Inference-profile invocation needs both the profile ARN
    // and the underlying foundation-model ARN (wildcard region — the
    // profile may route within its geography).
    generateDigestWorkerFn.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${config.BEDROCK_HAIKU_INFERENCE_PROFILE_ID}`,
          config.BEDROCK_HAIKU_FOUNDATION_MODEL_ARN,
        ],
      })
    );

    // Anthropic models are delivered via AWS Marketplace: the first
    // invocation in the account needs these actions so Bedrock can
    // auto-subscribe. One-time — after that, any role can invoke without
    // them. See https://repost.aws/knowledge-center/bedrock-resolve-marketplace-permission
    generateDigestWorkerFn.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
        resources: ["*"],
      })
    );

    // generate-digest: thin HTTP-facing Lambda behind POST /digests.
    // API Gateway REST APIs hard-cap the integration timeout at 29s, well
    // under how long Gemini generation (with retries) can take. So this
    // just validates the request and writes the "pending" row, then invokes
    // generateDigestWorkerFn asynchronously (InvocationType: Event) and
    // returns immediately. Kept as a separate function (rather than having
    // it invoke itself) because a self-referential grantInvoke() tangles
    // this function's IAM policy with API Gateway's deployment dependency
    // graph and CDK reports a circular dependency.
    const generateDigestFn = new lambdaNodejs.NodejsFunction(this, "GenerateDigestFunction", {
      entry: "lambdas/generate-digest/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DIGESTS_TABLE_NAME: digestsTable.tableName,
        GENERATE_DIGEST_WORKER_FUNCTION_NAME: generateDigestWorkerFn.functionName,
        CATALOG_VERSION: "0.0.0",
      },
    });

    digestsTable.grantReadWriteData(generateDigestFn);
    generateDigestWorkerFn.grantInvoke(generateDigestFn);

    // =====================================================================
    // Phase-1: Static/config Lambdas
    // =====================================================================

    // GET /digest-goals: returns DIGEST_GOALS as JSON (no DB access)
    const digestGoalsFn = new lambdaNodejs.NodejsFunction(this, "DigestGoalsFunction", {
      entry: "lambdas/digest-goals/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
    });

    // GET /sources/{sourceHash}: fetch a source from DynamoDB
    const fetchSourceFn = new lambdaNodejs.NodejsFunction(this, "FetchSourceFunction", {
      entry: "lambdas/fetch-source/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
      },
    });

    sourcesTable.grantReadData(fetchSourceFn);

    // GET /sources: list all ingested sources (Phase-2 multi-source picker)
    const listSourcesFn = new lambdaNodejs.NodejsFunction(this, "ListSourcesFunction", {
      entry: "lambdas/list-sources/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
      },
    });

    sourcesTable.grantReadData(listSourcesFn);

    // GET /sources/{sourceHash}/related: brute-force cosine-similarity search
    // over embeddings (see plans/dynamodb-migration.md §2 — the pgvector replacement)
    const relatedSourcesFn = new lambdaNodejs.NodejsFunction(this, "RelatedSourcesFunction", {
      entry: "lambdas/related-sources/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
      },
    });

    sourcesTable.grantReadData(relatedSourcesFn);

    // GET /digests/{digestId}: fetch a digest result from DynamoDB
    const fetchDigestFn = new lambdaNodejs.NodejsFunction(this, "FetchDigestFunction", {
      entry: "lambdas/fetch-digest/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DIGESTS_TABLE_NAME: digestsTable.tableName,
      },
    });

    digestsTable.grantReadData(fetchDigestFn);

    // =====================================================================
    // Phase-1: API Gateway routes
    // =====================================================================

    // POST /sources (submit URL for ingestion)
    const sources = api.root.addResource("sources", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    sources.addMethod(
      "POST",
      new apigw.LambdaIntegration(ingestUrlFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // GET /sources/{sourceHash}
    const sourceHash = sources.addResource("{sourceHash}", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    sourceHash.addMethod(
      "GET",
      new apigw.LambdaIntegration(fetchSourceFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // GET /sources/{sourceHash}/related
    const related = sourceHash.addResource("related", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    related.addMethod(
      "GET",
      new apigw.LambdaIntegration(relatedSourcesFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // GET /sources (list all) — must come before /sources/{sourceHash}
    sources.addMethod(
      "GET",
      new apigw.LambdaIntegration(listSourcesFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // GET /digest-goals (no auth — public config)
    const digestGoals = api.root.addResource("digest-goals", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    digestGoals.addMethod(
      "GET",
      new apigw.LambdaIntegration(digestGoalsFn, { proxy: true }),
      {
        // No authorizer
      }
    );

    // POST /digests, GET /digests?sourceHash=... (list digests for a source)
    const digests = api.root.addResource("digests", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    digests.addMethod(
      "POST",
      new apigw.LambdaIntegration(generateDigestFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );
    digests.addMethod(
      "GET",
      new apigw.LambdaIntegration(fetchDigestFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // GET /digests/{digestId}
    const digestId = digests.addResource("{digestId}", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    digestId.addMethod(
      "GET",
      new apigw.LambdaIntegration(fetchDigestFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // =====================================================================
    // Embed failure alerting
    // =====================================================================

    const embedAlertTopic = new sns.Topic(this, "EmbedAlertTopic", {
      displayName: "bookmark-digest-embed-alerts",
    });

    // Add email subscription — update the address before deploying.
    // Stack deploy fails if the email domain isn't confirmed in SES/SNS,
    // so this is optional: wrap in conditional or make the env var required.
    const alertEmail = process.env.EMBED_ALERT_EMAIL;
    if (alertEmail) {
      embedAlertTopic.addSubscription(new subs.EmailSubscription(alertEmail));
    }

    // Daily checker: scans for failed sources older than 1 hour and
    // publishes a CloudWatch alarm via SNS if any are found.
    const checkEmbedFailuresFn = new lambdaNodejs.NodejsFunction(this, "CheckEmbedFailuresFunction", {
      entry: "lambdas/check-embed-failures/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
        ALERT_TOPIC_ARN: embedAlertTopic.topicArn,
      },
    });

    sourcesTable.grantReadData(checkEmbedFailuresFn);
    embedAlertTopic.grantPublish(checkEmbedFailuresFn);

    // Run daily via EventBridge (cron: every day at 06:00 UTC)
    const eventBridgeRule = new Rule(this, "CheckEmbedFailuresSchedule", {
      schedule: Schedule.cron({ minute: "0", hour: "6" }),
      enabled: true,
    });
    eventBridgeRule.addTarget(new LambdaFunction(checkEmbedFailuresFn));

    // =====================================================================
    // Web hosting — Vite SPA (apps/web/dist) served via S3 + CloudFront.
    // Every page is a client component fetching the API above directly, so
    // no SSR runtime is needed.
    // =====================================================================

    const webBucket = new s3.Bucket(this, "WebBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // SPA fallback: extensionless URIs (no static file) are served as
    // /index.html so the React router handles them client-side.
    // Asset URLs (containing ".") pass through unchanged.
    const webUrlRewriteFn = new cloudfront.Function(this, "WebUrlRewriteFunction", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Serve only index.html for SPA routes (no file extension)
  if (uri.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}
      `),
    });

    const webDistribution = new cloudfront.Distribution(this, "WebDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: webUrlRewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/404.html" },
      ],
    });

    new s3deploy.BucketDeployment(this, "WebDeployment", {
      sources: [s3deploy.Source.asset("../web/dist")],
      destinationBucket: webBucket,
      distribution: webDistribution,
      distributionPaths: ["/*"],
    });

    // =====================================================================
    // Phase-1: CDK outputs
    // =====================================================================

    new cdk.CfnOutput(this, "WebUrl", { value: `https://${webDistribution.domainName}` });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "SourcesTableName", { value: sourcesTable.tableName });
    new cdk.CfnOutput(this, "DigestsTableName", { value: digestsTable.tableName });
  }
}
