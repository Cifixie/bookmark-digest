import type { GlossaryTermProps } from "@bookmark-digest/catalog";

export const GlossaryTerm = (props: GlossaryTermProps) => {
  const { term, definition } = props;
  return (
    <div style={{ margin: "8px 0", paddingLeft: 16, borderLeft: "3px solid var(--border-gray)" }}>
      <dt style={{ fontWeight: 600, color: "var(--text-heading)" }}>{term}</dt>
      <dd style={{ margin: "2px 0 0", color: "var(--text-primary)", lineHeight: 1.5 }}>{definition}</dd>
    </div>
  );
};
