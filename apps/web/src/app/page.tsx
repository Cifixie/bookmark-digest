"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmitUrlResponse } from "@bookmark-digest/schemas";
import { useAuth } from "@/lib/use-auth";

/**
 * Phase-0 exit-criteria page: paste a URL, hit submit, see it move through
 * the async pipeline. No real scraping/generation yet - this just proves
 * the plumbing (API Gateway -> Lambda -> Step Functions -> Postgres) works.
 */
export default function Home() {
  const router = useRouter();
  const { loading, signedIn, getIdToken, logout } = useAuth();

  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SubmitUrlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !signedIn) {
      router.push("/sign-in");
    }
  }, [loading, signedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const idToken = await getIdToken();
    if (!idToken) {
      setError("Not signed in");
      router.push("/sign-in");
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: idToken,
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data: SubmitUrlResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (loading || !signedIn) {
    return <main style={{ maxWidth: 480, margin: "4rem auto" }}>Loading...</main>;
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Bookmark Digest — Phase-0</h1>
        <button onClick={logout}>Sign out</button>
      </div>
      <form onSubmit={handleSubmit}>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
        <button type="submit" style={{ marginTop: 8 }}>
          Submit
        </button>
      </form>

      {result && (
        <pre style={{ marginTop: 16 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
