"use client";

import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import { amplifyConfig } from "@/lib/amplify-config";
import { PropsWithChildren } from "react";

let configured = false;

// Configure Amplify once before Authenticator renders.
if (typeof window !== "undefined" && !configured) {
  Amplify.configure(amplifyConfig, { ssr: true });
  configured = true;
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
  return (
    <Authenticator formFields={formFields} hideSignUp={true}>
      {({ signOut, user }) => <>{children}</>}
    </Authenticator>
  );
}
