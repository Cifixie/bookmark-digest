"use client";

import { useEffect } from "react";
import { Amplify } from "aws-amplify";
import { amplifyConfig } from "@/lib/amplify-config";

let configured = false;

/**
 * Configures Amplify once on mount. <Authenticator> from @aws-amplify/ui-react
 * needs Amplify configured before it renders — it does NOT configure itself.
 */
export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!configured) {
      Amplify.configure(amplifyConfig, { ssr: true });
      configured = true;
    }
  }, []);

  return <>{children}</>;
}
