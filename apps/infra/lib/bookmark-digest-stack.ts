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
 *   generate-digest Lambda → Bedrock (Claude) → DigestBlock[] → DynamoDB Digests
 *   API Gateway routes: /sources, /digest-goals, /digests
 *
 * NOTE: Aurora has been replaced by DynamoDB (see plans/dynamodb-migration.md).
 * No manual provisioning, no VPC, no secrets — tables are fully CDK-managed.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { StartingPosition, FilterRule, FilterCriteria } from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";

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
  modifiers: Record<string, unknown>;
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

    // =====================================================================
    // Phase-0: Existing resources (keep for backward compatibility)
    // =====================================================================

    const rawContentBucket = new s3.Bucket(this, "RawContentBucket", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const ingestFn = new lambdaNodejs.NodejsFunction(this, "IngestFunction", {
      entry: "lambdas/ingest/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      environment: {
        RAW_CONTENT_BUCKET: rawContentBucket.bucketName,
      },
    });

    rawContentBucket.grantWrite(ingestFn);

    const receivedState = new sfn.Pass(this, "Received");
    const processingState = new sfn.Pass(this, "Processing");
    const doneState = new sfn.Pass(this, "Done");

    const definition = receivedState.next(processingState).next(doneState);

    const stateMachine = new sfn.StateMachine(this, "IngestStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(5),
    });

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

    // Phase-0 route: POST /bookmarks
    const bookmarks = api.root.addResource("bookmarks", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["POST"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    bookmarks.addMethod(
      "POST",
      new apigw.LambdaIntegration(ingestFn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    stateMachine.grantStartExecution(ingestFn);

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
        BEDROCK_EMBEDDING_MODEL: "amazon.titan-embed-text-v2:0",
      },
    });

    embedSourceFn.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:eu-north-1::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    // DynamoEventSource only grants stream-read actions (GetRecords, etc.) —
    // it does not grant table access, which the handler needs for UpdateItem.
    sourcesTable.grantReadWriteData(embedSourceFn);

    // Wire embed-source as DynamoDB Stream consumer on SourcesTable
    embedSourceFn.addEventSource(new lambdaEventSources.DynamoEventSource(sourcesTable, {
      startingPosition: StartingPosition.LATEST,
      batchSize: 5,
      filters: [
        FilterCriteria.filter({
          eventName: FilterRule.isEqual("INSERT"),
        }),
      ],
    }));

    // generate-digest: call Claude via Bedrock for structured output
    const generateDigestFn = new lambdaNodejs.NodejsFunction(this, "GenerateDigestFunction", {
      entry: "lambdas/generate-digest/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(10),
      environment: {
        SOURCES_TABLE_NAME: sourcesTable.tableName,
        DIGESTS_TABLE_NAME: digestsTable.tableName,
        BEDROCK_MODEL: "anthropic.claude-sonnet-4-0-20250514-v1:0",
        DIGEST_MAX_RETRIES: "3",
        DIGEST_MAX_TOKENS: "4096",
        CATALOG_VERSION: "0.0.0",
      },
    });

    sourcesTable.grantReadData(generateDigestFn);
    digestsTable.grantReadWriteData(generateDigestFn);
    generateDigestFn.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:eu-north-1::foundation-model/anthropic.claude-sonnet-4-0-20250514-v1:0`,
        ],
      })
    );

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
    // Phase-1: CDK outputs
    // =====================================================================

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "SourcesTableName", { value: sourcesTable.tableName });
    new cdk.CfnOutput(this, "DigestsTableName", { value: digestsTable.tableName });
  }
}
