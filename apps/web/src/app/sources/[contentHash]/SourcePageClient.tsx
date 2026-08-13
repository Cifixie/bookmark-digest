import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "@/utils/fetchApi";
import { useParams } from "react-router-dom";

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
}

interface DigestRow {
  id: string;
  digestGoal: string;
  status: string;
  createdAt: string;
  model: string | null;
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
    ready: "#22c55e",
    fetched: "#3b82f6",
    embedding: "#f59e0b",
    failed: "#ef4444",
    thin: "#f97316",
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

function ContentViewer({ content }: { content: string }) {
  // Simple line-break preservation with a code-friendly style for raw content.
  return (
    <pre
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: "#374151",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
        padding: "16px 20px",
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        maxHeight: 480,
        overflowY: "auto",
      }}
    >
      {content}
    </pre>
  );
}

function DigestLinkRow({ digest }: { digest: DigestRow }) {
  const colorMap: Record<string, string> = {
    done: "#22c55e",
    generating: "#f59e0b",
    pending: "#9ca3af",
    failed: "#ef4444",
  };
  const color = colorMap[digest.status] ?? "#9ca3af";

  return (
    <Link
      to={`/digests/${digest.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid #f3f4f6",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span style={{ textTransform: "capitalize", fontSize: 13, fontWeight: 500 }}>
        {digest.digestGoal}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#999" }}>
        {digest.model && <span>{digest.model}</span>}
        <span style={{ color }}>{digest.status}</span>
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
          color: "#4a90d9",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        ← Back to Browse
      </Link>

      <h1 style={{ fontSize: 18, marginBottom: 4, wordBreak: "break-word" }}>
        {fallbackTitle(source?.url ?? "")}
      </h1>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          fontSize: 12,
          color: "#999",
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
              color: "#4a90d9",
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
            color: "#bbb",
            marginBottom: 16,
            wordBreak: "break-all",
          }}
        >
          {truncateUrl(source.url)}
        </p>
      )}

      {loading && <p style={{ color: "#999", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>}

      {source && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", margin: "20px 0 8px" }}>
            Content ({source.content.length.toLocaleString()} chars)
          </h2>
          <ContentViewer content={source.content} />
        </>
      )}

      {source && digests.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", margin: "24px 0 8px" }}>
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
        <p style={{ color: "#999", fontSize: 13, marginTop: 16 }}>
          No digests generated from this source yet.
        </p>
      )}
    </>
  );
}
