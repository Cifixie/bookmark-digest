/**
 * Amplify Auth config. Values come from CDK stack outputs
 * (UserPoolId, UserPoolClientId) - see apps/web/.env.local.
 *
 * No self sign-up: this is a single-user personal tool, accounts are
 * created manually via AWS Console/CLI (admin-create-user), so Amplify's
 * sign-up flow is never used here - only signIn.
 */

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const signUpVerificationMethod = "code" as const;

if (!userPoolId || !userPoolClientId) {
  throw new Error(
    "Amplify Auth config is missing required environment variables: NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID",
  );
}

export const amplifyConfig = {
  Auth: {
    Cognito: { userPoolId, userPoolClientId, signUpVerificationMethod },
  },
};
