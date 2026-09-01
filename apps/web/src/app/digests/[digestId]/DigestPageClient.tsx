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

interface RelatedSourceRow {
  contentHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  title: string | null;
  score: number;
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
  const [relatedSources, setRelatedSources] = useState<RelatedSourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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

  // Fetch related sources when digest has a sourceHash
  useEffect(() => {
    if (!digest?.sourceHash) return;
    (async () => {
      const res = await fetchWithAuth("GET", `/sources/${digest.sourceHash}/related?count=3`);
      if (res.ok) {
        const data = await res.json();
        setRelatedSources((data.items ?? []) as RelatedSourceRow[]);
      }
    })();
  }, [digest?.sourceHash]);

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

      {relatedSources.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", margin: "24px 0 8px" }}>
            Related from your bookmarks
          </h2>
          <div style={{ padding: "0 4px" }}>
            {relatedSources.map((item) => (
              <Link
                key={item.contentHash}
                to={`/sources/${item.contentHash}`}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "var(--bg-muted)",
                  marginBottom: 6,
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title ?? item.url}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {item.contentType} · {new Date(item.fetchedAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
          <button
            onClick={async () => {
              setGenerating(true);
              try {
                // Infer sourceMode from date spread
                const dates = relatedSources.map((s) => new Date(s.fetchedAt).getTime());
                const min = Math.min(...dates);
                const max = Math.max(...dates);
                const spread = max - min;
                const sourceMode = spread <= 30 * 24 * 60 * 60 * 1000 ? "compare" : "evolution";

                const res = await fetchWithAuth("POST", "/digests", {
                  sourceHashes: relatedSources.map((s) => s.contentHash),
                  digestGoal: "tl_dr",
                  sourceMode,
                });
                if (res.ok) {
                  const data = await res.json();
                  window.location.href = `/digests/${data.digestId}`;
                } else {
                  const errData = await res.json().catch(() => ({}));
                  setError(errData.error ?? `Generation failed: ${res.status}`);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating}
            style={{
              marginTop: 12,
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid var(--brand)",
              background: "var(--brand)",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "Generating…" : "Generate digest from related sources"}
          </button>
        </>
      )}

      {digest?.status === "failed" && digest?.error && (
        <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>
          {digest.error}
        </p>
      )}
    </>
  );
}
