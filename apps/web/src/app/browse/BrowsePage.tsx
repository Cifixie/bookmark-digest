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

/** Semantic search result from /digests/search endpoint. */
interface SearchScoredDigest {
  id: string;
  sourceHash: string;
  digestGoal: string;
  status: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_TYPES = ["article", "video", "unknown"] as const;
const SOURCE_STATUSES = ["fetched", "embedding", "ready", "failed"] as const;
const DIGEST_STATUSES = ["pending", "generating", "done", "failed"] as const;

const SUBJECT_COLORS: Record<string, string> = {
  engineering: "var(--subject-engineering)",
  "ai-ml": "var(--subject-ai-ml)",
  design: "var(--subject-design)",
  business: "var(--subject-business)",
  science: "var(--subject-science)",
  productivity: "var(--subject-productivity)",
  culture: "var(--subject-culture)",
  health: "var(--subject-health)",
  finance: "var(--subject-finance)",
  other: "var(--subject-other)",
};

function getSourceBadgeColor(status: string): string {
  const map: Record<string, string> = {
    ready: "var(--badge-ready)",
    fetched: "var(--badge-fetched)",
    embedding: "var(--badge-embedding)",
    failed: "var(--badge-failed)",
  };
  return map[status] ?? "var(--badge-pending)";
}

function getSourceBadgeBg(status: string): string {
  const map: Record<string, string> = {
    ready: "var(--badge-ready-bg)",
    fetched: "var(--badge-fetched-bg)",
    embedding: "var(--badge-embedding-bg)",
    failed: "var(--badge-failed-bg)",
  };
  return map[status] ?? "var(--badge-pending-bg)";
}

function getDigestBadgeColor(status: string): string {
  const map: Record<string, string> = {
    done: "var(--badge-done)",
    generating: "var(--badge-generating)",
    pending: "var(--badge-pending)",
    failed: "var(--badge-failed)",
  };
  return map[status] ?? "var(--badge-pending)";
}

function getDigestBadgeBg(status: string): string {
  const map: Record<string, string> = {
    done: "var(--badge-done-bg)",
    generating: "var(--badge-generating-bg)",
    pending: "var(--badge-pending-bg)",
    failed: "var(--badge-failed-bg)",
  };
  return map[status] ?? "var(--badge-pending-bg)";
}

function getShapeBadge(mode: string | null, multiCount: number): { label: string; color: string; bg: string } | null {
  if (mode === "compare") return { label: "Compare", color: "var(--accent-purple)", bg: "var(--shape-compare-bg)" };
  if (mode === "evolution") return { label: "Evolution", color: "var(--accent-cyan)", bg: "var(--shape-evolution-bg)" };
  if (multiCount > 1) return { label: `Synthesize (${multiCount})`, color: "var(--accent-indigo)", bg: "var(--shape-synthesize-bg)" };
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
    border: "1px solid var(--border-primary)",
    fontSize: 13,
    background: "var(--bg-card)",
    cursor: "pointer",
    minWidth: 100,
  };

  const inputStyle: React.CSSProperties = { ...selectStyle, width: 140 };

  const toggleStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-primary)",
    fontSize: 12,
    fontWeight: 600,
    background: "var(--bg-muted)",
    cursor: "pointer",
    color: "var(--text-muted)",
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
            background: params.semantic ? "var(--brand)" : "var(--bg-muted)",
            color: params.semantic ? "white" : "var(--text-muted)",
          }}
        >
          ✦ Semantic
        </button>
      )}
      {tab === "digests" && (
        <button
          onClick={() => updateParam("semantic", params.semantic ? "" : "1")}
          style={{
            ...toggleStyle,
            background: params.semantic ? "var(--brand)" : "var(--bg-muted)",
            color: params.semantic ? "white" : "var(--text-muted)",
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
        <button onClick={() => onParamsChange({})} style={{ ...selectStyle, background: "var(--bg-muted)", color: "var(--text-muted)" }}>
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
          border: "1px solid var(--border-primary)",
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
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, wordBreak: "break-all" }}>
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
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--text-subtle)" }}>
          <span>{domainFromUrl(item.url)}</span>
          <span>{item.contentType}</span>
          <span>{new Date(item.fetchedAt).toLocaleDateString()}</span>
          {item.embedded && <span style={{ color: "var(--accent-green)" }}>✓ embedded</span>}
          {item._score !== undefined && (
            <span style={{ color: "var(--brand)" }}>match: {(item._score * 100).toFixed(0)}%</span>
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
          color: "var(--brand)",
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
  const subjectColor = subject ? SUBJECT_COLORS[subject] ?? "var(--badge-pending)" : "var(--badge-pending)";

  return (
    <Link
      to={`/digests/${item.id}`}
      style={{
        display: "block",
        border: "1px solid var(--border-primary)",
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
              <span style={{ fontSize: 10, fontWeight: 600, color: shape.color, padding: "1px 6px", borderRadius: 8, background: shape.bg }}>
                {shape.label}
              </span>
            )}
            {subject && (
              <span style={{ fontSize: 10, fontWeight: 600, color: subjectColor, padding: "1px 6px", borderRadius: 8, background: `${subjectColor}20` }}>
                {subject}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
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

      // Semantic search (digests): hit the dedicated search endpoint.
      if (tab === "digests" && params.semantic && params.q) {
        const searchQs = new URLSearchParams({ q: params.q });
        if (params.from) searchQs.set("from", params.from);
        if (params.to) searchQs.set("to", params.to);
        const res = await fetchWithAuth("GET", `/digests/search?${searchQs}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Semantic search failed: ${res.status}`);
        }
        const data = await res.json();
        const scored: SearchScoredDigest[] = data.items ?? [];
        setItems(
          scored.map((s) => ({
            id: s.id,
            sourceHash: s.sourceHash,
            sourceHashes: null,
            digestGoal: s.digestGoal,
            sourceMode: null,
            status: s.status,
            multiSourceCount: 0,
            meta: s.meta,
            createdAt: s.createdAt,
            completedAt: null,
            model: null,
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
      <Link to="/" style={{ fontSize: 13, color: "var(--brand)", textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
        ← Back to Home
      </Link>

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Browse</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--bg-muted)", borderRadius: 8, padding: 3 }}>
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
              background: tab === t ? "var(--bg-card)" : "transparent",
              color: tab === t ? "var(--text-heading)" : "var(--text-muted)",
              boxShadow: tab === t ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <FilterBar tab={tab} params={params} onParamsChange={updateParams} />

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>{error}</p>}

      {!loading && !error && (
        <>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            {items.length} {tab}
          </p>
          {tab === "sources"
            ? (items as BrowseSourceItem[]).map((item) => <SourceRow key={item.sourceHash} item={item} />)
            : (items as BrowseDigestItem[]).map((item) => <DigestRow key={item.id} item={item} />)}
          {items.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {params.semantic ? "No semantic matches" : `No ${tab} found`} matching the current filters.
            </p>
          )}
        </>
      )}
    </>
  );
}
