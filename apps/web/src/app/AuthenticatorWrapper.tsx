import { Link } from "react-router-dom";
import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import { amplifyConfig } from "@/lib/amplify-config";
import { PropsWithChildren } from "react";

Amplify.configure(amplifyConfig);

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
              <p style={{ color: "#666", fontSize: 13, marginBottom: 0 }}>
                Signed in as: {user?.username || "unknown"}
              </p>
              <Link
                to="/digests"
                style={{
                  fontSize: 13,
                  color: "#4a90d9",
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
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
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
