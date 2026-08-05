/**
 * Amplify Auth config. Values come from CDK stack outputs
 * (UserPoolId, UserPoolClientId) - see apps/web/.env.local.
 *
 * No self sign-up: this is a single-user personal tool, accounts are
 * created manually via AWS Console/CLI (admin-create-user), so Amplify's
 * sign-up flow is never used here - only signIn.
 */
export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      signUpVerificationMethod: "code" as const,
    },
  },
};
