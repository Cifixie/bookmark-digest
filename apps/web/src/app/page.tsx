"use client";

import { useState } from "react";
import type { SubmitUrlResponse } from "@bookmark-digest/schemas";

/**
 * Phase-0 exit-criteria page: paste a URL, hit submit, see it move through
 * the async pipeline. No real scraping/generation yet - this just proves
 * the plumbing (API Gateway -> Lambda -> Step Functions -> Postgres) works.
 */
export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SubmitUrlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Bookmark Digest — Phase-0</h1>
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
