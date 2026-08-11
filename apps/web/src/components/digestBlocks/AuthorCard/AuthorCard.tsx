import type { AuthorCardProps } from "@bookmark-digest/catalog";

export const AuthorCard = (props: AuthorCardProps) => {
  const { name, text, type, url, context } = props;
  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderLeft: "3px solid #4a90d9",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "12px 0",
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: "#222", fontSize: 15 }}>{name}</span>
        {type && (
          <span style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: 0.5 }}>{type}</span>
        )}
      </div>
      <p style={{ margin: 0, color: "#555", fontSize: 14, lineHeight: 1.6 }}>{text}</p>
      {(context || url) && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
          {context}
          {context && url ? " · " : null}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" style={{ color: "#4a90d9" }}>
              Source
            </a>
          )}
        </div>
      )}
    </div>
  );
};
