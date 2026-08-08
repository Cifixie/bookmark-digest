import type { BaseComponentProps } from "@json-render/react";
import type { GlossaryTermProps } from "@bookmark-digest/catalog";

export const GlossaryTerm = ({ props }: BaseComponentProps<GlossaryTermProps>) => {
  const { term, definition } = props;
  return (
    <div style={{ margin: "8px 0", paddingLeft: 16, borderLeft: "3px solid #ccc" }}>
      <dt style={{ fontWeight: 600, color: "#222" }}>{term}</dt>
      <dd style={{ margin: "2px 0 0", color: "#555", lineHeight: 1.5 }}>{definition}</dd>
    </div>
  );
};
