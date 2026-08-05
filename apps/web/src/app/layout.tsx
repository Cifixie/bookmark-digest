"use client";

import { AmplifyProvider } from "@/components/AmplifyProvider";
import { Authenticator } from "@aws-amplify/ui-react";

export const metadata = {
  title: "Bookmark Digest",
  description: "Phase-0 skeleton",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider>
          <Authenticator
            content={() => children}
            hideSignUp={true}
          />
        </AmplifyProvider>
      </body>
    </html>
  );
}
