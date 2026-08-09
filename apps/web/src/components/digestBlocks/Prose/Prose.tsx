import type { ProseProps } from "@bookmark-digest/catalog";

export const Prose = (props: ProseProps) => {
  const { paragraphs } = props;
  return (
    <div style={{ margin: "8px 0" }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 12px", lineHeight: 1.7, color: "#333" }}>{p}</p>
      ))}
    </div>
  );
};
