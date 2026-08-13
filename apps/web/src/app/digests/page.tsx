import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "@/utils/fetchApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestItem {
  id: string;
  sourceHash: string;
  digestGoal: string;
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
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Read URL hash on mount and auto-load.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      setSourceHash(hash);
      setAutoLoaded(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Auto-load once — only when `autoLoaded` is true (set by mount effect, never by user input).
  useEffect(() => {
    if (sourceHash.trim() && autoLoaded) {
      loadDigests();
      setAutoLoaded(false);
    }
  }, [sourceHash]);

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

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Digests</h1>

      <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
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
            border: "1px solid var(--border-primary)",
            fontSize: 13,
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={loadDigests}
          disabled={loading || !sourceHash.trim()}
          style={{
            padding: "6px 16px",
            background: "var(--brand)",
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

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</p>}
      {error && (
        <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}

      {!loading && !error && digests.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          No digests found for this source hash.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {digests.map((d) => (
          <DigestListItem key={d.id} digest={d} />
        ))}
      </div>
    </>
  );
}

function DigestListItem({ digest }: { digest: DigestItem }) {
  const colorMap: Record<string, string> = {
    done: "var(--badge-done)",
    generating: "var(--badge-generating)",
    pending: "var(--badge-pending)",
    failed: "var(--badge-failed)",
  };
  const color = colorMap[digest.status] ?? "var(--badge-pending)";

  return (
    <Link
      to={`/digests/${digest.id}`}
      style={{
        display: "block",
        border: "1px solid var(--border-primary)",
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
          color: "var(--text-secondary)",
          marginTop: 4,
          wordBreak: "break-all",
        }}
      >
        ID: {digest.id.slice(0, 12)}… | {digest.createdAt.slice(0, 10)}
        {digest.model && ` | ${digest.model}`}
      </div>
      {digest.error && (
        <p style={{ color: "var(--badge-error)", fontSize: 12, margin: "4px 0 0 0" }}>
          {digest.error}
        </p>
      )}
    </Link>
  );
}
