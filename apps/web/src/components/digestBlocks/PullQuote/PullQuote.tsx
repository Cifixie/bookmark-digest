import type { PullQuoteProps } from "@bookmark-digest/catalog";

export const PullQuote = (props: PullQuoteProps) => {
  const { text } = props;
  return (
    <blockquote
      style={{
        margin: "24px 0",
        padding: "0 8px",
        border: "none",
        borderTop: "none",
        borderBottom: "none",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.5,
          color: "#1a1a1a",
          fontStyle: "italic",
        }}
      >
        "{text}"
      </p>
    </blockquote>
  );
};
