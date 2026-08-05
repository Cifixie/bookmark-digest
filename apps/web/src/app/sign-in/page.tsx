"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, confirmSignIn } from "aws-amplify/auth";

/**
 * Sign-in page. Since users are created manually via AWS Console/CLI
 * (admin-create-user, no self sign-up), the first login always triggers
 * Cognito's NEW_PASSWORD_REQUIRED challenge - this form handles both that
 * and normal subsequent logins.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn({ username: email, password });

      if (result.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setNeedsNewPassword(true);
        return;
      }

      if (result.isSignedIn) {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await confirmSignIn({ challengeResponse: newPassword });
      if (result.isSignedIn) {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set new password");
    } finally {
      setSubmitting(false);
    }
  }

  if (needsNewPassword) {
    return (
      <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Set a permanent password</h1>
        <p>First login requires setting a new password.</p>
        <form onSubmit={handleNewPassword}>
          <input
            type="password"
            required
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
            {submitting ? "Setting password..." : "Set password"}
          </button>
        </form>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>
      <form onSubmit={handleSignIn}>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
