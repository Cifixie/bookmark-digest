import type { FigureProps } from "@bookmark-digest/catalog";

export const Figure = (props: FigureProps) => {
  const { alt, caption, source } = props;
  return (
    <figure style={{ margin: "16px 0", textAlign: "center" }}>
      <div style={{
        background: "#e0e0e0",
        height: 180,
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888",
        fontSize: 14,
        marginBottom: 8,
      }}>
        {alt ? `[${alt}]` : "[Figure placeholder]"}
      </div>
      {(caption || source) && (
        <figcaption style={{ fontSize: 13, color: "#888" }}>
          {caption}
          {source && source !== caption ? <span> · Source: {source}</span> : null}
        </figcaption>
      )}
    </figure>
  );
};
