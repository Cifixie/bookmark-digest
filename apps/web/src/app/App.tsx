import { Outlet } from "react-router-dom";
import AuthenticatorWrapper from "./AuthenticatorWrapper";
import { BuildInfo } from "@/lib/buildInfo";

export default function App() {
  return (
    <AuthenticatorWrapper>
      <BuildInfo />
      <main
        style={{
          maxWidth: 640,
          margin: "2rem auto",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "0 16px",
        }}
      >
        <Outlet />
      </main>
    </AuthenticatorWrapper>
  );
}
