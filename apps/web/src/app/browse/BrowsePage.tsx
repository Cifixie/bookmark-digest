import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchWithAuth } from "@/utils/fetchApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrowseSourceItem {
  sourceHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  title: string | null;
  embedded?: boolean;
  embeddingModel?: string | null;
  /** Relevance score from semantic search (0-1). Only present on semantic results. */
  _score?: number;
}

interface BrowseDigestItem {
  id: string;
  sourceHash: string;
  sourceHashes: string[] | null;
  digestGoal: string;
  sourceMode: string | null;
  status: string;
  multiSourceCount: number;
  /** AI-generated metadata from DigestMeta schema. */
  meta: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
  model: string | null;
}

/** Semantic search result from /sources/search endpoint. */
interface SearchScoredSource {
  contentHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  title: string | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_TYPES = ["article", "video", "unknown"] as const;
const SOURCE_STATUSES = ["fetched", "embedding", "ready", "failed"] as const;
const DIGEST_STATUSES = ["pending", "generating", "done", "failed"] as const;

const SUBJECT_COLORS: Record<string, string> = {
  engineering: "#3b82f6",
  "ai-ml": "#a855f7",
  design: "#ec4899",
  business: "#f59e0b",
  science: "#22c55e",
  productivity: "#0891b2",
  culture: "#f97316",
  health: "#14b8a6",
  finance: "#6366f1",
  other: "#9ca3af",
};

function getSourceBadgeColor(status: string): string {
  const map: Record<string, string> = {
    ready: "#22c55e",
    fetched: "#3b82f6",
    embedding: "#f59e0b",
    failed: "#ef4444",
  };
  return map[status] ?? "#9ca3af";
}

function getDigestBadgeColor(status: string): string {
  const map: Record<string, string> = {
    done: "#22c55e",
    generating: "#f59e0b",
    pending: "#9ca3af",
    failed: "#ef4444",
  };
  return map[status] ?? "#9ca3af";
}

function getShapeBadge(mode: string | null, multiCount: number): { label: string; color: string } | null {
  if (mode === "compare") return { label: "Compare", color: "#a855f7" };
  if (mode === "evolution") return { label: "Evolution", color: "#0891b2" };
  if (multiCount > 1) return { label: `Synthesize (${multiCount})`, color: "#6366f1" };
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

function fallbackTitle(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "…";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function FilterBar({
  tab,
  params,
  onParamsChange,
}: {
  tab: "sources" | "digests";
  params: Record<string, string>;
  onParamsChange: (next: Record<string, string>) => void;
}) {
  const updateParam = (key: string, value: string) => {
    onParamsChange({ ...params, [key]: value });
  };

  const selectStyle: React.CSSProperties = {
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    fontSize: 13,
    background: "white",
    cursor: "pointer",
    minWidth: 100,
  };

  const inputStyle: React.CSSProperties = { ...selectStyle, width: 140 };

  const toggleStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    fontSize: 12,
    fontWeight: 600,
    background: "#f9fafb",
    cursor: "pointer",
    color: "#6b7280",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
      <input
        type="text"
        placeholder="Search…"
        value={params.q ?? ""}
        onChange={(e) => updateParam("q", e.target.value)}
        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
      />

      {tab === "sources" && (
        <button
          onClick={() => updateParam("semantic", params.semantic ? "" : "1")}
          style={{
            ...toggleStyle,
            background: params.semantic ? "#4a90d9" : "#f9fafb",
            color: params.semantic ? "white" : "#6b7280",
          }}
        >
          ✦ Semantic
        </button>
      )}

      {tab === "sources" && (
        <select value={params.contentType ?? ""} onChange={(e) => updateParam("contentType", e.target.value)} style={selectStyle}>
          <option value="">All types</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      <select value={params.status ?? ""} onChange={(e) => updateParam("status", e.target.value)} style={selectStyle}>
        <option value="">All statuses</option>
        {(tab === "sources" ? SOURCE_STATUSES : DIGEST_STATUSES).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <input type="date" value={params.from ?? ""} onChange={(e) => updateParam("from", e.target.value)} title="From date" style={inputStyle} />
      <input type="date" value={params.to ?? ""} onChange={(e) => updateParam("to", e.target.value)} title="To date" style={inputStyle} />

      {tab === "digests" && (
        <select value={params.digestGoal ?? ""} onChange={(e) => updateParam("digestGoal", e.target.value)} style={selectStyle}>
          <option value="">All goals</option>
          <option value="tl_dr">TL;DR</option>
          <option value="summary">Summary</option>
          <option value="understand">Understand</option>
        </select>
      )}

      {Object.values(params).some((v) => v !== "") && (
        <button onClick={() => onParamsChange({})} style={{ ...selectStyle, background: "#f9fafb", color: "#6b7280" }}>
          Clear
        </button>
      )}
    </div>
  );
}

function SourceRow({ item }: { item: BrowseSourceItem }) {
  const displayTitle = item.title ?? fallbackTitle(item.url);

  return (
    <>
      <Link
        to={`/sources/${item.sourceHash}`}
        style={{
          display: "block",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "12px 16px",
          textDecoration: "none",
          color: "inherit",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayTitle}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2, wordBreak: "break-all" }}>
              {truncateUrl(item.url)}
            </div>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: getSourceBadgeColor(item.status),
              padding: "2px 8px",
              borderRadius: 12,
              background: `${getSourceBadgeColor(item.status)}20`,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {item.status}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#bbb" }}>
          <span>{domainFromUrl(item.url)}</span>
          <span>{item.contentType}</span>
          <span>{new Date(item.fetchedAt).toLocaleDateString()}</span>
          {item.embedded && <span style={{ color: "#22c55e" }}>✓ embedded</span>}
          {item._score !== undefined && (
            <span style={{ color: "#4a90d9" }}>match: {(item._score * 100).toFixed(0)}%</span>
          )}
        </div>
      </Link>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block",
          textAlign: "center",
          fontSize: 12,
          color: "#4a90d9",
          textDecoration: "none",
          marginBottom: 8,
        }}
      >
        Open original ↗
      </a>
    </>
  );
}

function DigestRow({ item }: { item: BrowseDigestItem }) {
  const shape = getShapeBadge(item.sourceMode, item.multiSourceCount);
  const subject = item.meta?.subject as string | undefined;
  const tags = item.meta?.tags as string[] | undefined;
  const subjectColor = subject ? SUBJECT_COLORS[subject] ?? "#9ca3af" : "#9ca3af";

  return (
    <Link
      to={`/digests/${item.id}`}
      style={{
        display: "block",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "12px 16px",
        textDecoration: "none",
        color: "inherit",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <strong style={{ fontSize: 14, textTransform: "capitalize" }}>{item.digestGoal}</strong>
            {shape && (
              <span style={{ fontSize: 10, fontWeight: 600, color: shape.color, padding: "1px 6px", borderRadius: 8, background: `${shape.color}20` }}>
                {shape.label}
              </span>
            )}
            {subject && (
              <span style={{ fontSize: 10, fontWeight: 600, color: subjectColor, padding: "1px 6px", borderRadius: 8, background: `${subjectColor}20` }}>
                {subject}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#999" }}>
            {item.model && `${item.model} · `}
            {new Date(item.createdAt).toLocaleDateString()}
            {tags && tags.length > 0 && (
              <span style={{ marginLeft: 4 }}>{tags.map((t) => `#${t}`).join(" ")}</span>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: getDigestBadgeColor(item.status),
            padding: "2px 8px",
            borderRadius: 12,
            background: `${getDigestBadgeColor(item.status)}20`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {item.status}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrowsePage() {
  const [tab, setTab] = useState<"sources" | "digests">("sources");
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<BrowseSourceItem[] | BrowseDigestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebuilding this object on every render (without memoizing) would give
  // `loadItems` a new dependency identity each time, which retriggers the
  // effect below, which sets state, which re-renders — an infinite fetch
  // loop. Keying the memo off the query string itself (a stable primitive)
  // means `params` only changes when the URL's query actually changes.
  const searchParamsKey = searchParams.toString();
  const params: Record<string, string> = useMemo(() => {
    const p: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (value) p[key] = value;
    }
    return p;
  }, [searchParamsKey]);

  const updateParams = useCallback(
    (next: Record<string, string>) => {
      const all = { ...params, ...next };
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(all)) {
        if (v) qs.set(k, v);
      }
      setSearchParams(qs);
    },
    [params, setSearchParams],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v && k !== "semantic") qs.set(k, v);
      }

      // Semantic search: hit the dedicated search endpoint.
      if (tab === "sources" && params.semantic && params.q) {
        const searchQs = new URLSearchParams({ q: params.q });
        if (params.from) searchQs.set("from", params.from);
        if (params.to) searchQs.set("to", params.to);
        const res = await fetchWithAuth("GET", `/sources/search?${searchQs}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Semantic search failed: ${res.status}`);
        }
        const data = await res.json();
        const scored: SearchScoredSource[] = data.items ?? [];
        setItems(
          scored.map((s) => ({
            sourceHash: s.contentHash,
            url: s.url,
            contentType: s.contentType,
            fetchedAt: s.fetchedAt,
            fetchedBy: null,
            status: "ready",
            title: s.title,
            embedded: true,
            _score: s.score,
          })),
        );
        return;
      }

      const path = tab === "sources" ? `/sources?${qs}` : `/digests?${qs}`;
      const res = await fetchWithAuth("GET", path);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setItems(data[tab === "sources" ? "sources" : "digests"] ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tab, params]);

  useEffect(() => {
    loadItems();
  }, [tab, params, loadItems]);

  return (
    <>
      <Link to="/" style={{ fontSize: 13, color: "#4a90d9", textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
        ← Back to Home
      </Link>

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Browse</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
        {(["sources", "digests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "#111827" : "#6b7280",
              boxShadow: tab === t ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <FilterBar tab={tab} params={params} onParamsChange={updateParams} />

      {loading && <p style={{ color: "#999", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>}

      {!loading && !error && (
        <>
          <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
            {items.length} {tab}
          </p>
          {tab === "sources"
            ? (items as BrowseSourceItem[]).map((item) => <SourceRow key={item.sourceHash} item={item} />)
            : (items as BrowseDigestItem[]).map((item) => <DigestRow key={item.id} item={item} />)}
          {items.length === 0 && (
            <p style={{ color: "#999", fontSize: 13 }}>
              {tab === "sources" && params.semantic ? "No semantic matches" : `No ${tab} found`} matching the current filters.
            </p>
          )}
        </>
      )}
    </>
  );
}
