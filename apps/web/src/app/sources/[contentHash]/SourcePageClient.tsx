import { useState, useEffect, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "@/utils/fetchApi";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceResponse {
  sourceHash: string;
  url: string;
  content: string;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  siteName: string | null;
}

interface DigestRow {
  id: string;
  digestGoal: string;
  status: string;
  createdAt: string;
  model: string | null;
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

function truncateUrl(url: string, maxLen = 80): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "…";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ready: "var(--badge-ready)",
    fetched: "var(--badge-fetched)",
    embedding: "var(--badge-embedding)",
    failed: "var(--badge-failed)",
    thin: "var(--badge-thin)",
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

function ContentViewer({ content }: { content: string }) {
  // Simple line-break preservation with a code-friendly style for raw content.
  return (
    <pre
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-primary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
        padding: "16px 20px",
        background: "var(--bg-muted)",
        borderRadius: 8,
        border: "1px solid var(--border-primary)",
        maxHeight: 480,
        overflowY: "auto",
      }}
    >
      {content}
    </pre>
  );
}

const contentBoxStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-primary)",
  margin: 0,
  padding: "16px 20px",
  background: "var(--bg-muted)",
  borderRadius: 8,
  border: "1px solid var(--border-primary)",
  maxHeight: 480,
  overflowY: "auto",
};

function MarkdownViewer({ content }: { content: string }) {
  return (
    <div style={contentBoxStyle}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          img: ({ style, ...props }) => (
            <img {...props} style={{ ...style, maxWidth: "100%", height: "auto" }} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function SourceMetaCard({ source }: { source: SourceResponse }) {
  if (!source.description && !source.ogImage && !source.siteName) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 16,
        padding: 12,
        background: "var(--bg-muted)",
        borderRadius: 8,
        border: "1px solid var(--border-primary)",
      }}
    >
      {source.ogImage && (
        <img
          src={source.ogImage}
          alt=""
          style={{
            width: 120,
            height: 90,
            objectFit: "cover",
            borderRadius: 6,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        {source.siteName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            {source.siteName}
          </div>
        )}
        {source.description && (
          <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0 }}>{source.description}</p>
        )}
      </div>
    </div>
  );
}

function DigestLinkRow({ digest }: { digest: DigestRow }) {
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--border-secondary)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span style={{ textTransform: "capitalize", fontSize: 13, fontWeight: 500 }}>
        {digest.digestGoal}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
        {digest.model && <span>{digest.model}</span>}
        <span style={{ color }}>{digest.status}</span>
      </span>
    </Link>
  );
}

function RelatedSourceLinkRow({ item }: { item: RelatedSourceRow }) {
  return (
    <Link
      to={`/sources/${item.contentHash}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--border-secondary)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.title ?? fallbackTitle(item.url)}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
        <span>{domainFromUrl(item.url)}</span>
        <span style={{ color: "var(--brand)" }}>{(item.score * 100).toFixed(0)}% match</span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SourcePageClient() {
  const { contentHash } = useParams<{ contentHash: string }>();
  const [source, setSource] = useState<SourceResponse | null>(null);
  const [digests, setDigests] = useState<DigestRow[]>([]);
  const [relatedSources, setRelatedSources] = useState<RelatedSourceRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"markdown" | "raw">("markdown");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contentHash) return;
    (async () => {
      try {
        // Fetch source
        const srcRes = await fetchWithAuth("GET", `/sources/${contentHash}`);
        if (!srcRes.ok) {
          const data = await srcRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Source request failed: ${srcRes.status}`);
        }
        const srcData: SourceResponse = await srcRes.json();
        setSource(srcData);

        // Fetch related digests
        const digRes = await fetchWithAuth("GET", `/digests?sourceHash=${contentHash}`);
        if (digRes.ok) {
          const digData = await digRes.json();
          setDigests((digData.digests ?? []) as DigestRow[]);
        }

        // Fetch related sources (brute-force cosine similarity over embeddings)
        const relRes = await fetchWithAuth("GET", `/sources/${contentHash}/related`);
        if (relRes.ok) {
          const relData = await relRes.json();
          setRelatedSources((relData.items ?? []) as RelatedSourceRow[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [contentHash]);

  return (
    <>
      <Link
        to="/browse"
        style={{
          fontSize: 13,
          color: "var(--brand)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        ← Back to Browse
      </Link>

      <h1 style={{ fontSize: 18, marginBottom: 4, wordBreak: "break-word" }}>
        {source?.title || fallbackTitle(source?.url ?? "")}
      </h1>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          fontSize: 12,
          color: "var(--text-secondary)",
          marginBottom: 4,
        }}
      >
        {source && (
          <>
            <StatusBadge status={source.status} />
            <span>{source.contentType}</span>
            <span>{domainFromUrl(source.url)}</span>
            <span>Fetched {new Date(source.fetchedAt).toLocaleDateString()}</span>
            {source.fetchedBy && <span>{source.fetchedBy}</span>}
          </>
        )}
        {source && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: "var(--brand)",
              textDecoration: "none",
              marginLeft: "auto",
            }}
          >
            Open original ↗
          </a>
        )}
      </div>

      {source && (
        <p
          style={{
            fontSize: 11,
            color: "var(--text-subtle)",
            marginBottom: 16,
            wordBreak: "break-all",
          }}
        >
          {truncateUrl(source.url)}
        </p>
      )}

      {source && <SourceMetaCard source={source} />}

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "var(--badge-error)", fontSize: 13, margin: "8px 0" }}>{error}</p>}

      {source && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              margin: "20px 0 8px",
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>
              Content ({source.content.length.toLocaleString()} chars)
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              {(["markdown", "raw"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    padding: "3px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-primary)",
                    background: viewMode === mode ? "var(--brand)" : "transparent",
                    color: viewMode === mode ? "white" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {viewMode === "markdown" ? (
            <MarkdownViewer content={source.content} />
          ) : (
            <ContentViewer content={source.content} />
          )}
        </>
      )}

      {source && digests.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", margin: "24px 0 8px" }}>
            Generated from this source ({digests.length})
          </h2>
          <div style={{ padding: "0 4px" }}>
            {digests.map((d) => (
              <DigestLinkRow key={d.id} digest={d} />
            ))}
          </div>
        </>
      )}

      {source && digests.length === 0 && !loading && (
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 16 }}>
          No digests generated from this source yet.
        </p>
      )}

      {source && relatedSources.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", margin: "24px 0 8px" }}>
            Related from your bookmarks
          </h2>
          <div style={{ padding: "0 4px" }}>
            {relatedSources.map((item) => (
              <RelatedSourceLinkRow key={item.contentHash} item={item} />
            ))}
          </div>
          {relatedSources.length >= 3 && (
            <button
              onClick={async () => {
                setGenerating(true);
                try {
                  // Infer sourceMode from date spread
                  const dates = relatedSources.slice(0, 3).map((s) => s.fetchedAt);
                  const [min, max] = [Math.min(...dates.map((d) => new Date(d).getTime())), Math.max(...dates.map((d) => new Date(d).getTime()))];
                  const spread = max - min;
                  const sourceMode = spread <= 30 * 24 * 60 * 60 * 1000 ? "compare" : "evolution";

                  const res = await fetchWithAuth("POST", "/digests", {
                    sourceHashes: relatedSources.slice(0, 3).map((s) => s.contentHash),
                    digestGoal: "tl_dr",
                    sourceMode,
                  });
                  if (res.ok) {
                    const data = await res.json();
                    window.location.href = `/digests/${data.id}`;
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
              {generating ? "Generating…" : "Generate digest from these related sources"}
            </button>
          )}
        </>
      )}
    </>
  );
}
