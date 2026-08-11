"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { fetchWithAuth } from "@/utils/fetchApi";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/lib/registry";
import type { Spec } from "@bookmark-digest/catalog";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestResponse {
  id: string;
  sourceHash: string;
  digestGoal: string;
  modifiers: Record<string, unknown>;
  paramsVersion: string;
  status: string;
  output: Spec | null;
  error: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function DigestSpecRenderer({ spec }: { spec: Spec | null }) {
  if (!spec || !spec.elements || Object.keys(spec.elements).length === 0) {
    return <p style={{ color: "#999", fontSize: 13 }}>No output</p>;
  }

  return (
    <StateProvider>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer spec={spec} registry={registry as any} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    done: "#22c55e",
    generating: "#f59e0b",
    pending: "#9ca3af",
    failed: "#ef4444",
  };
  const color = colorMap[status] ?? "#9ca3af";

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        padding: "2px 8px",
        borderRadius: 12,
        background: `${color}20`,
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DigestPage({
  params,
}: {
  params: Promise<{ digestId: string }>;
}) {
  const { digestId } = use(params);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log("Fetching digest with ID:", digestId);
  console.log("digest", digest);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth("GET", `/digests/${digestId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }
        const data: DigestResponse = await res.json();
        setDigest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [digestId]);

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

      <h1
        style={{ fontSize: 20, marginBottom: 4, textTransform: "capitalize" }}
      >
        {digest?.digestGoal}
      </h1>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 12,
          color: "#999",
          marginBottom: 16,
        }}
      >
        <StatusBadge status={digest?.status ?? ""} />
        {digest?.model && <span>Model: {digest.model}</span>}
        <span>Created: {digest?.createdAt?.slice(0, 10)}</span>
      </div>

      {loading && <p style={{ color: "#999", fontSize: 13 }}>Loading…</p>}
      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}

      {digest?.status === "done" && digest?.output && (
        <DigestSpecRenderer spec={digest.output} />
      )}

      {digest?.status === "failed" && digest?.error && (
        <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>
          {digest.error}
        </p>
      )}

      {digest?.modifiers && Object.keys(digest.modifiers).length > 0 && (
        <details style={{ marginTop: 16, fontSize: 12, color: "#999" }}>
          <summary style={{ cursor: "pointer" }}>Modifiers</summary>
          <pre
            style={{
              background: "#f9fafb",
              padding: 8,
              borderRadius: 4,
              marginTop: 4,
              overflow: "auto",
              fontSize: 11,
            }}
          >
            {JSON.stringify(digest.modifiers, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}
