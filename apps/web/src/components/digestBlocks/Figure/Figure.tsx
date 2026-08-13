import type { FigureProps } from "@bookmark-digest/catalog";

export const Figure = (props: FigureProps) => {
  const { alt, caption, source } = props;
  return (
    <figure style={{ margin: "16px 0", textAlign: "center" }}>
      <div style={{
        background: "var(--bg-muted)",
        height: 180,
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 14,
        marginBottom: 8,
      }}>
        {alt ? `[${alt}]` : "[Figure placeholder]"}
      </div>
      {(caption || source) && (
        <figcaption style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {caption}
          {source && source !== caption ? <span> · Source: {source}</span> : null}
        </figcaption>
      )}
    </figure>
  );
};
