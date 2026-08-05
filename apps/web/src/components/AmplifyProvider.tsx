"use client";

import { useEffect } from "react";
import { Amplify } from "aws-amplify";
import { amplifyConfig } from "@/lib/amplify-config";

let configured = false;

/**
 * Configures Amplify once when the app mounts. Mount this near the root
 * (in layout.tsx) so every page/component can use aws-amplify/auth
 * functions without configuring it themselves.
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
