import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
//import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as cognito from "aws-cdk-lib/aws-cognito";

/**
 * Phase-0 skeleton stack.
 *
 * Goal: prove the async plumbing works end to end, with no real
 * scraping or generation logic yet:
 *   Cognito (auth) -> API Gateway -> Lambda (accept URL, write row placeholder)
 *   -> Step Functions (received -> processing -> done) -> S3 (raw content
 *   bucket, unused for now)
 *
 * Postgres/RDS is intentionally NOT provisioned here yet - add it once
 * you've decided between RDS vs Aurora Serverless v2, since that's a
 * cost/behavior tradeoff worth its own review rather than a default.
 *
 * Cognito is set up as a single-user pool (self sign-up disabled - you
 * create your own account via CLI/console) since this is a personal tool,
 * not a multi-tenant product. The API's POST method requires a valid
 * Cognito ID token; wiring actual sign-in in the Next.js app (Amplify or
 * NextAuth's Cognito provider) is the next step once this deploys.
 */
export class BookmarkDigest extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const rawContentBucket = new s3.Bucket(this, "RawContentBucket", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const ingestFn = new lambda.NodejsFunction(this, "IngestFunction", {
      entry: "lambdas/ingest/handler.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      environment: {
        RAW_CONTENT_BUCKET: rawContentBucket.bucketName,
      },
    });

    rawContentBucket.grantWrite(ingestFn);

    // Placeholder state machine: no real work yet, just proves the
    // received -> processing -> done shape before Firecrawl/yt-dlp/Bedrock
    // logic gets slotted in.
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
      selfSignUpEnabled: false, // personal tool - you create the one account yourself
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
      // No client secret: this will be called from the Next.js app
      // (browser/server) via a public client, not a confidential backend.
      generateSecret: false,
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "ApiAuthorizer",
      {
        cognitoUserPools: [userPool],
      },
    );

    const api = new apigw.RestApi(this, "BookmarkApi", {
      restApiName: "bookmark-digest-api",
      deployOptions: { stageName: "dev" },
    });

    const bookmarks = api.root.addResource("bookmarks", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS, // tighten to your actual frontend domain(s) once deployed
        allowMethods: ["POST"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    bookmarks.addMethod("POST", new apigw.LambdaIntegration(ingestFn, {
      proxy: true, // pass headers through from Lambda response
    }), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    stateMachine.grantStartExecution(ingestFn);

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
