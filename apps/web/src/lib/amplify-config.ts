const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: userPoolId || "",
      userPoolClientId: userPoolClientId || "",
    },
  },
};
