import AuthenticatorWrapper from "./AuthenticatorWrapper";
import "@aws-amplify/ui-react/styles.css";

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
        <AuthenticatorWrapper>{children}</AuthenticatorWrapper>
      </body>
    </html>
  );
}
