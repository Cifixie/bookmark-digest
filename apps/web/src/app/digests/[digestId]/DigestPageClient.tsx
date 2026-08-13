import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "@/utils/fetchApi";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/lib/registry";
import type { Spec } from "@bookmark-digest/catalog";
import { useParams } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestResponse {
  id: string;
  sourceHash: string;
  digestGoal: string;
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
    return <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No output</p>;
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
    done: "var(--badge-done)",
    generating: "var(--badge-generating)",
    pending: "var(--badge-pending)",
    failed: "var(--badge-failed)",
  };
  const color = colorMap[status] ?? "var(--badge-pending)";

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

export default function DigestPageClient() {
  const { digestId } = useParams<{ digestId: string }>();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!digestId) return;
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
    <>
      <Link
        to="/"
        style={{
          fontSize: 13,
          color: "var(--brand)",
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
          color: "var(--text-secondary)",
          marginBottom: 16,
        }}
      >
        <StatusBadge status={digest?.status ?? ""} />
        {digest?.model && <span>Model: {digest.model}</span>}
        <span>Created: {digest?.createdAt?.slice(0, 10)}</span>
      </div>

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</p>}
      {error && (
        <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}

      {digest?.status === "done" && digest?.output && (
        <DigestSpecRenderer spec={digest.output} />
      )}

      {digest?.status === "failed" && digest?.error && (
        <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>
          {digest.error}
        </p>
      )}
    </>
  );
}
