import type { AuthorCardProps } from "@bookmark-digest/catalog";

export const AuthorCard = (props: AuthorCardProps) => {
  const { name, text, type, url, context } = props;
  return (
    <div
      style={{
        border: "1px solid var(--border-light)",
        borderLeft: "3px solid var(--brand-blue)",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "12px 0",
        background: "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: "var(--text-heading)", fontSize: 15 }}>{name}</span>
        {type && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{type}</span>
        )}
      </div>
      <p style={{ margin: 0, color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>{text}</p>
      {(context || url) && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
          {context}
          {context && url ? " · " : null}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--brand-blue)" }}>
              Source
            </a>
          )}
        </div>
      )}
    </div>
  );
};
