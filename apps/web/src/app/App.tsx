import { Outlet } from "react-router-dom";
import AuthenticatorWrapper from "./AuthenticatorWrapper";
import { BuildInfo } from "@/lib/buildInfo";

export default function App() {
  return (
    <AuthenticatorWrapper>
      <BuildInfo />
      {/* Force dark theme on the content area */}
      <style>{`
        main { background: var(--bg-page); color: var(--text-primary); }
        main h1, main h2, main h3, main h4, main h5, main h6 { color: var(--text-heading); }
        main a { color: var(--brand); }
        main a:hover { color: var(--brand-hover); }
        main button { color: var(--text-primary); background: var(--bg-muted); border-color: var(--border-primary); }
        main input, main textarea, main select {
          background: var(--bg-input);
          color: var(--text-primary);
          border-color: var(--border-primary);
        }
        main input::placeholder, main textarea::placeholder { color: var(--text-subtle); }
      `}</style>
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
