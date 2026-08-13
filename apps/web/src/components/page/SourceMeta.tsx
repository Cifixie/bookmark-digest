export const SourceMeta = ({ kind, author, publication, publishDate, readingTimeMinutes, healthStatus }: {
  kind: "written" | "temporal";
  author: string;
  publication?: string;
  publishDate?: string;
  readingTimeMinutes?: number;
  healthStatus?: "ok" | "moved" | "paywalled" | "404" | "inaccessible";
}) => (
  <div style={{
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    padding: "12px 16px",
    background: "var(--bg-muted)",
    borderRadius: "8px",
    margin: "12px 0",
    fontSize: 14,
    color: "var(--text-muted)",
  }}>
    <span>📄 {kind}</span>
    <span>✍️ {author}</span>
    {publication && <span>📰 {publication}</span>}
    {publishDate && <span>📅 {publishDate}</span>}
    {readingTimeMinutes && <span>⏱ {readingTimeMinutes} min read</span>}
    {healthStatus && healthStatus !== "ok" && <span style={{ color: "var(--accent-red)" }}>⚠️ {healthStatus}</span>}
  </div>
);
