"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchWithAuth } from "@/utils/fetchApi";
import Link from "next/link";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { registry } from "@/lib/registry";
import type { Spec } from "@bookmark-digest/catalog";
import {
  listDigestGoalsResponseSchema,
  type DigestGoalApi as DigestGoal,
} from "@bookmark-digest/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceResponse {
  sourceHash: string;
  url: string;
  content?: string | null;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

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

interface IngestResponse {
  sourceHash: string;
  status: "new" | "existing";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Renders a digest Spec through json-render's Renderer. */
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

/** Source status card. */
function SourceCard({ source }: { source: SourceResponse }) {
  const statusColor =
    source.status === "ready"
      ? "#22c55e"
      : source.status === "embedding"
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0 }}>Source</h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: statusColor,
            background: `${statusColor}20`,
            padding: "2px 8px",
            borderRadius: 12,
          }}
        >
          {source.status}
        </span>
      </div>
      <p
        style={{
          margin: "8px 0 0 0",
          fontSize: 13,
          color: "#666",
          wordBreak: "break-all",
        }}
      >
        {source.url}
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 8,
          fontSize: 12,
          color: "#999",
        }}
      >
        <span>{source.contentType}</span>
        <span>fetched {source.fetchedAt}</span>
        <span>hash: {source.sourceHash.slice(0, 12)}…</span>
        {source.embedding && <span>✓ embedded</span>}
      </div>
    </div>
  );
}

/** Goal picker. */
function GoalPicker({
  goal,
  onGenerate,
  generating,
}: {
  goal: DigestGoal;
  onGenerate: (goal: DigestGoal) => void;
  generating: boolean;
}) {
  const [selected, setSelected] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        background: selected ? "#f0f7ff" : "white",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => setSelected(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <div>
          <strong style={{ fontSize: 14 }}>{goal.label}</strong>
          <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#666" }}>
            {goal.description}
          </p>
        </div>
      </label>

      {selected && (
        <div style={{ marginTop: 8, paddingLeft: 28 }}>
          <button
            onClick={() => onGenerate(goal)}
            disabled={generating}
            style={{
              padding: "6px 16px",
              background: generating ? "#9ca3af" : "#4a90d9",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: generating ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Digest result card. */
function DigestResultCard({
  digest,
  onRefresh,
}: {
  digest: DigestResponse;
  onRefresh: () => void;
}) {
  const statusColor =
    digest.status === "done"
      ? "#22c55e"
      : digest.status === "generating"
        ? "#f59e0b"
        : digest.status === "failed"
          ? "#ef4444"
          : "#9ca3af";

  // Poll for status updates if still generating
  useEffect(() => {
    if (digest.status === "generating" || digest.status === "pending") {
      const interval = setInterval(onRefresh, 3000);
      return () => clearInterval(interval);
    }
  }, [digest.status, onRefresh]);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        marginTop: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h4 style={{ margin: 0, textTransform: "capitalize" }}>
          {digest.digestGoal}
        </h4>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: statusColor,
            padding: "2px 8px",
            borderRadius: 12,
            background: `${statusColor}20`,
          }}
        >
          {digest.status}
        </span>
      </div>

      {digest.status === "done" && digest.output ? (
        <DigestSpecRenderer spec={digest.output} />
      ) : digest.error ? (
        <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0 0 0" }}>
          {digest.error}
        </p>
      ) : (
        <p style={{ color: "#999", fontSize: 13, margin: "8px 0 0 0" }}>
          {digest.status === "pending" ? "Queued…" : "Generating…"}
        </p>
      )}

      {digest.model && (
        <p style={{ fontSize: 11, color: "#bbb", margin: "8px 0 0 0" }}>
          Model: {digest.model}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  // Input
  const [url, setUrl] = useState("");

  // State
  const [source, setSource] = useState<SourceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Goals
  const [goals, setGoals] = useState<DigestGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

  // Digests
  const [digests, setDigests] = useState<DigestResponse[]>([]);
  const [generatingGoals, setGeneratingGoals] = useState<
    Record<string, boolean>
  >({});

  // Loaded goals on mount
  useEffect(() => {
    loadGoals();
  }, []);

  async function loadGoals() {
    setGoalsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (apiUrl) {
        const res = await fetch(`${apiUrl}/digest-goals`);
        if (res.ok) {
          const data = listDigestGoalsResponseSchema.parse(await res.json());
          setGoals(data.goals);
        }
      }
    } catch {
      console.warn("Could not load digest goals");
    } finally {
      setGoalsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSource(null);
    setDigests([]);

    try {
      const res = await fetchWithAuth("POST", "/sources", { url });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data: IngestResponse = await res.json();
      setSource({
        sourceHash: data.sourceHash,
        url,
        status: "fetched",
        contentType: "article",
        fetchedAt: new Date().toISOString(),
        fetchedBy: "firecrawl",
      });

      // Poll for source readiness
      pollSource(data.sourceHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function pollSource(sourceHash: string) {
    const poll = async () => {
      try {
        const res = await fetchWithAuth("GET", `/sources/${sourceHash}`);
        if (res.ok) {
          const data: SourceResponse = await res.json();
          setSource(data);

          if (data.status === "ready" || data.status === "failed") {
            return; // Stop polling
          }
        }
      } catch {
        // Continue polling
      }

      // Keep polling every 3s until ready
      setTimeout(poll, 3000);
    };

    poll();
  }

  async function handleGenerateGoal(goal: DigestGoal) {
    if (!source || !source.sourceHash) return;

    setGeneratingGoals((prev) => ({ ...prev, [goal.goal]: true }));

    try {
      const res = await fetchWithAuth("POST", "/digests", {
        sourceHash: source.sourceHash,
        digestGoal: goal.goal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data = await res.json();
      // Poll for digest result
      pollDigest(data.digestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGeneratingGoals((prev) => ({ ...prev, [goal.goal]: false }));
    }
  }

  async function pollDigest(digestId: string) {
    const poll = async () => {
      try {
        const res = await fetchWithAuth("GET", `/digests/${digestId}`);
        if (res.ok) {
          const data: DigestResponse = await res.json();

          setDigests((prev) => {
            const idx = prev.findIndex((d) => d.id === digestId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data;
              return next;
            }
            return [...prev, data];
          });

          if (data.status === "done" || data.status === "failed") {
            return; // Stop polling
          }
        }
      } catch {
        // Continue polling
      }

      setTimeout(poll, 3000);
    };

    poll();
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bookmark Digest</h1>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <p style={{ color: "#666", fontSize: 13, marginBottom: 0 }}>
          Signed in as: {user?.username || "unknown"}
        </p>
        <Link
          href="/digests"
          style={{
            fontSize: 13,
            color: "#4a90d9",
            textDecoration: "none",
          }}
        >
          View digests
        </Link>
      </div>
      <button
        onClick={() => signOut()}
        style={{
          padding: "4px 12px",
          fontSize: 13,
          marginBottom: 16,
          cursor: "pointer",
          background: "#f3f4f6",
          border: "1px solid #d1d5db",
          borderRadius: 6,
        }}
      >
        Sign out
      </button>

      {/* URL submit */}
      <form onSubmit={handleSubmit}>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 14,
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            marginTop: 8,
            padding: "8px 24px",
            background: "#4a90d9",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Submit
        </button>
      </form>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      {/* Source card */}
      {source && <SourceCard source={source} />}

      {/* Digest goals */}
      {source?.status === "ready" && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Digest Goals</h3>
          {goalsLoading ? (
            <p style={{ color: "#999", fontSize: 13 }}>Loading goals…</p>
          ) : goals.length > 0 ? (
            goals.map((goal) => (
              <GoalPicker
                key={goal.goal}
                goal={goal}
                onGenerate={handleGenerateGoal}
                generating={!!generatingGoals[goal.goal]}
              />
            ))
          ) : (
            <p style={{ color: "#999", fontSize: 13 }}>
              No digest goals available
            </p>
          )}
        </div>
      )}

      {/* Digest results */}
      {digests.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Results</h3>
          {digests.map((digest) => (
            <DigestResultCard
              key={digest.id}
              digest={digest}
              onRefresh={() => {
                if (digest.id) {
                  pollDigest(digest.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
