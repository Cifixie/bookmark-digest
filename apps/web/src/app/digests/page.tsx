"use client";

import { useState } from "react";
import { fetchWithAuth } from "@/utils/fetchApi";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestItem {
  id: string;
  sourceHash: string;
  digestGoal: string;
  modifiers: Record<string, unknown>;
  status: string;
  error: string | null;
  model: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DigestsPage() {
  const [digests, setDigests] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceHash, setSourceHash] = useState("");

  async function loadDigests() {
    if (!sourceHash.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        "GET",
        `/digests?sourceHash=${encodeURIComponent(sourceHash.trim())}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setDigests(data.digests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "2rem auto",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "0 16px",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: 13,
          color: "#4a90d9",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        ← Back to Home
      </Link>

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Digests</h1>

      <p style={{ color: "#999", fontSize: 12, marginBottom: 12 }}>
        Enter the source hash (from the source card on the home page) to list
        all digests for that source.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="text"
          placeholder="Source hash…"
          value={sourceHash}
          onChange={(e) => setSourceHash(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadDigests();
          }}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={loadDigests}
          disabled={loading || !sourceHash.trim()}
          style={{
            padding: "6px 16px",
            background: "#4a90d9",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: loading || !sourceHash.trim() ? "not-allowed" : "pointer",
            opacity: loading || !sourceHash.trim() ? 0.6 : 1,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {loading && <p style={{ color: "#999", fontSize: 13 }}>Loading…</p>}
      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}

      {!loading && !error && digests.length === 0 && (
        <p style={{ color: "#999", fontSize: 13 }}>
          No digests found for this source hash.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {digests.map((d) => (
          <DigestListItem key={d.id} digest={d} />
        ))}
      </div>
    </main>
  );
}

function DigestListItem({ digest }: { digest: DigestItem }) {
  const colorMap: Record<string, string> = {
    done: "#22c55e",
    generating: "#f59e0b",
    pending: "#9ca3af",
    failed: "#ef4444",
  };
  const color = colorMap[digest.status] ?? "#9ca3af";

  return (
    <Link
      href={`/digests/${digest.id}`}
      style={{
        display: "block",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 14, textTransform: "capitalize" }}>
          {digest.digestGoal}
        </strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color,
            padding: "2px 8px",
            borderRadius: 12,
            background: `${color}20`,
          }}
        >
          {digest.status}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#999",
          marginTop: 4,
          wordBreak: "break-all",
        }}
      >
        ID: {digest.id.slice(0, 12)}… | {digest.createdAt.slice(0, 10)}
        {digest.model && ` | ${digest.model}`}
      </div>
      {digest.error && (
        <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0 0" }}>
          {digest.error}
        </p>
      )}
    </Link>
  );
}
