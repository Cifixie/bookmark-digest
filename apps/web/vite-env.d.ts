/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_URL: string;
  readonly VITE_PUBLIC_COGNITO_USER_POOL_ID: string;
  readonly VITE_PUBLIC_COGNITO_CLIENT_ID: string;
  readonly VITE_BUILD_TIME: string;
  readonly VITE_COMMIT_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
