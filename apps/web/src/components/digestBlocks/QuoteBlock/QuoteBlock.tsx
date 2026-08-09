import type { QuoteBlockProps } from "@bookmark-digest/catalog";

export const QuoteBlock = (props: QuoteBlockProps) => {
  const { quote, attribution, timestampSeconds } = props;
  return (
    <blockquote style={{
      margin: "12px 0",
      padding: "12px 20px",
      borderLeft: "4px solid #ccc",
      background: "#fafafa",
      borderRadius: "0 8px 8px 0",
    }}>
      <p style={{ margin: "0 0 8px", fontStyle: "italic", color: "#444", lineHeight: 1.6 }}>
        "{quote}"
      </p>
      {(attribution || timestampSeconds) && (
        <cite style={{ fontSize: 13, color: "#888" }}>
          {attribution && <span>{attribution}</span>}
          {attribution && timestampSeconds !== undefined && <span> · </span>}
          {timestampSeconds !== undefined && <span>at {Math.floor(timestampSeconds / 60)}:{String(timestampSeconds % 60).padStart(2, "0")}</span>}
        </cite>
      )}
    </blockquote>
  );
};
