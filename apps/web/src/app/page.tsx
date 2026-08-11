import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchWithAuth } from "@/utils/fetchApi";
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

interface SourceItem {
  sourceHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

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

function SourceCard({
  source,
  checked,
  onChange,
}: {
  source: SourceItem;
  checked?: boolean;
  onChange?: (hash: string) => void;
}) {
  const statusColor =
    source.status === "ready"
      ? "#22c55e"
      : source.status === "embedding"
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div
      style={{
        border: checked ? "2px solid #4a90d9" : "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
        cursor: onChange ? "pointer" : "default",
      }}
      onClick={() => onChange?.(source.sourceHash)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onChange && (
            <input
              type="checkbox"
              checked={checked ?? false}
              onChange={() => onChange(source.sourceHash)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginTop: 0 }}
            />
          )}
          <h3 style={{ margin: 0 }}>Source</h3>
        </div>
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

function GoalPicker({
  goal,
  onGenerate,
  generating,
  sourceHash,
}: {
  goal: DigestGoal;
  onGenerate: (goal: DigestGoal, sourceHash: string) => void;
  generating: boolean;
  sourceHash: string;
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
            onClick={() => onGenerate(goal, sourceHash)}
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
          {digest.sourceHash !== digest.sourceHash ? (
            <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>
              {" "}
              (multi-source)
            </span>
          ) : null}
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
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedSourceHashes, setSelectedSourceHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<DigestGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [digests, setDigests] = useState<DigestResponse[]>([]);
  const [generatingGoals, setGeneratingGoals] = useState<
    Record<string, boolean>
  >({});
  const [generatingMulti, setGeneratingMulti] = useState(false);
  const [multiSourceGoal, setMultiSourceGoal] = useState("summary");
  const [loadingSources, setLoadingSources] = useState(false);

  useEffect(() => {
    loadGoals();
  }, []);

  useEffect(() => {
    // Load all existing sources on mount
    loadAllSources();
  }, []);

  async function loadGoals() {
    setGoalsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_PUBLIC_API_URL;
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

  async function loadAllSources() {
    setLoadingSources(true);
    try {
      const res = await fetchWithAuth("GET", "/sources");
      if (res.ok) {
        const data = await res.json();
        const items = (data.sources as SourceItem[]) ?? [];
        setSources(items);
      }
    } catch {
      console.warn("Failed to load sources");
    } finally {
      setLoadingSources(false);
    }
  }

  function toggleSource(hash: string) {
    setSelectedSourceHashes((prev) =>
      prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash],
    );
  }

  function toggleAllSources(checked: boolean) {
    setSelectedSourceHashes(checked ? sources.map((s) => s.sourceHash) : []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDigests([]);

    try {
      const res = await fetchWithAuth("POST", "/sources", { url });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data: IngestResponse = await res.json();
      // Add to sources list
      setSources((prev) => [
        ...prev.filter((s) => s.sourceHash !== data.sourceHash),
        {
          sourceHash: data.sourceHash,
          url,
          status: "fetched",
          contentType: "article",
          fetchedAt: new Date().toISOString(),
          fetchedBy: "firecrawl",
        },
      ]);
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
          setSources((prev) =>
            prev.map((s) =>
              s.sourceHash === sourceHash
                ? {
                    ...s,
                    status: data.status,
                    embedding: data.embedding,
                    embeddingModel: data.embeddingModel,
                  }
                : s,
            ),
          );

          if (data.status === "ready" || data.status === "failed") {
            return;
          }
        }
      } catch {
        // Continue polling
      }

      setTimeout(poll, 3000);
    };

    poll();
  }

  async function handleGenerateGoal(
    goal: DigestGoal,
    sourceHash: string,
  ) {
    setGeneratingGoals((prev) => ({ ...prev, [goal.goal]: true }));

    try {
      const res = await fetchWithAuth("POST", "/digests", {
        sourceHash,
        digestGoal: goal.goal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data = await res.json();
      pollDigest(data.digestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGeneratingGoals((prev) => ({ ...prev, [goal.goal]: false }));
    }
  }

  async function handleGenerateMulti() {
    if (selectedSourceHashes.length < 2) return;
    setGeneratingMulti(true);
    setError(null);

    try {
      const res = await fetchWithAuth("POST", "/digests", {
        sourceHashes: selectedSourceHashes,
        digestGoal: multiSourceGoal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data = await res.json();
      pollDigest(data.digestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Multi-source generation failed");
    } finally {
      setGeneratingMulti(false);
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
            return;
          }
        }
      } catch {
        // Continue polling
      }

      setTimeout(poll, 3000);
    };

    poll();
  }

  const readySources = sources.filter((s) => s.status === "ready");

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bookmark Digest</h1>

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
          Submit URL
        </button>
      </form>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      {/* --- Single-source: show last submitted source --- */}
      {sources.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>
            Latest Source
          </h3>
          <SourceCard source={sources[0]} />
          {sources[0].status === "ready" && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>
                Digest Goals
              </h4>
              {goalsLoading ? (
                <p style={{ color: "#999", fontSize: 13 }}>
                  Loading goals…
                </p>
              ) : goals.length > 0 ? (
                goals.map((goal) => (
                  <GoalPicker
                    key={goal.goal}
                    goal={goal}
                    onGenerate={handleGenerateGoal}
                    generating={!!generatingGoals[goal.goal]}
                    sourceHash={sources[0].sourceHash}
                  />
                ))
              ) : (
                <p style={{ color: "#999", fontSize: 13 }}>
                  No digest goals available
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Multi-source: select from saved sources --- */}
      {readySources.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0 }}>
              Compare / Synthesize ({readySources.length} saved sources)
            </h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    selectedSourceHashes.length === readySources.length &&
                    readySources.length > 0
                  }
                  onChange={(e) => toggleAllSources(e.target.checked)}
                  style={{ marginRight: 4 }}
                />
                {selectedSourceHashes.length > 0
                  ? `${selectedSourceHashes.length} selected`
                  : "Select all"}
              </label>
              {selectedSourceHashes.length >= 2 && goals.length > 0 && (
                <select
                  value={multiSourceGoal}
                  onChange={(e) => setMultiSourceGoal(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {goals.map((goal) => (
                    <option key={goal.goal} value={goal.goal}>
                      {goal.label}
                    </option>
                  ))}
                </select>
              )}
              {selectedSourceHashes.length >= 2 && (
                <button
                  onClick={handleGenerateMulti}
                  disabled={generatingMulti}
                  style={{
                    padding: "6px 16px",
                    background: generatingMulti ? "#9ca3af" : "#4a90d9",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: generatingMulti ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {generatingMulti
                    ? "Generating…"
                    : `Generate digest (${selectedSourceHashes.length})`}
                </button>
              )}
            </div>
          </div>

          {loadingSources && (
            <p style={{ color: "#999", fontSize: 13, margin: "4px 0" }}>
              Loading…
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {readySources.map((source) => (
              <SourceCard
                key={source.sourceHash}
                source={source}
                checked={selectedSourceHashes.includes(source.sourceHash)}
                onChange={toggleSource}
              />
            ))}
          </div>
        </div>
      )}

      {/* --- Results --- */}
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

      {digests.length > 0 && (
        <p style={{ marginTop: 16 }}>
          <Link
            to="/digests"
            style={{ fontSize: 13, color: "#4a90d9", textDecoration: "none" }}
          >
            View all digests →
          </Link>
        </p>
      )}
    </>
  );
}
