const userPoolId = import.meta.env.VITE_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_PUBLIC_COGNITO_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  throw new Error(
    "Missing required environment variables: VITE_PUBLIC_COGNITO_USER_POOL_ID and VITE_PUBLIC_COGNITO_CLIENT_ID",
  );
}

export const amplifyConfig = {
  Auth: {
    Cognito: { userPoolId, userPoolClientId },
  },
};
