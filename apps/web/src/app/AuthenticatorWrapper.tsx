import { Link } from "react-router-dom";
import { Amplify } from "aws-amplify";
import { getCurrentUser, signIn } from "aws-amplify/auth";
import { Authenticator } from "@aws-amplify/ui-react";
import { amplifyConfig } from "@/lib/amplify-config";
import { PropsWithChildren, useEffect, useState } from "react";

Amplify.configure(amplifyConfig);

const devAutoLoginEmail = import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL;
const devAutoLoginPassword = import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD;

// Dev convenience only: signs in with a real Cognito user from env vars so
// `npm run dev` skips the login form. Stripped from production builds since
// import.meta.env.DEV is a build-time constant. Never touches the API
// Gateway authorizer — the token is a genuine Cognito session.
const devAutoLoginEnabled =
  import.meta.env.DEV && !!devAutoLoginEmail && !!devAutoLoginPassword;

async function attemptDevAutoLogin() {
  try {
    await getCurrentUser();
    return;
  } catch {
    // not signed in yet, fall through to sign-in
  }
  try {
    await signIn({ username: devAutoLoginEmail!, password: devAutoLoginPassword! });
  } catch (err) {
    console.warn("[dev-auto-login] failed, falling back to manual sign-in", err);
  }
}

const formFields = {
  signIn: {
    username: {
      placeholder: "Enter your email",
    },
  },
  forceNewPassword: {
    password: {
      placeholder: "Enter your new password",
    },
  },
};

export default function AuthenticatorWrapper({ children }: PropsWithChildren) {
  const [devAutoLoginDone, setDevAutoLoginDone] = useState(!devAutoLoginEnabled);

  useEffect(() => {
    if (!devAutoLoginEnabled) return;
    attemptDevAutoLogin().finally(() => setDevAutoLoginDone(true));
  }, []);

  if (!devAutoLoginDone) {
    return null;
  }

  return (
    <Authenticator formFields={formFields} hideSignUp={true}>
      {({ signOut, user }) => (
        <>
          <div
            style={{
              maxWidth: 640,
              margin: "1rem auto 0",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              padding: "0 16px",
              background: "var(--bg-page)",
              color: "var(--text-primary)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 0 }}>
                Signed in as: {user?.username || "unknown"}
              </p>
              <Link
                to="/digests"
                style={{
                  fontSize: 13,
                  color: "var(--brand)",
                  textDecoration: "none",
                }}
              >
                View digests
              </Link>
            </div>
            <button
              onClick={() => signOut?.()}
              style={{
                padding: "4px 12px",
                fontSize: 13,
                marginBottom: 16,
                cursor: "pointer",
                background: "var(--bg-muted)",
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
              }}
            >
              Sign out
            </button>
          </div>
          {children}
        </>
      )}
    </Authenticator>
  );
}
