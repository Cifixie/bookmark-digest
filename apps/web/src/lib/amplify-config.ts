const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID",
  );
}

export const amplifyConfig = {
  Auth: {
    Cognito: { userPoolId, userPoolClientId },
  },
};
