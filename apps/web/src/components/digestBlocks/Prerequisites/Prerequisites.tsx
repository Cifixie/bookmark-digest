import type { BaseComponentProps } from "@json-render/react";
import type { PrerequisitesProps } from "@bookmark-digest/catalog";

export const Prerequisites = ({ props }: BaseComponentProps<PrerequisitesProps>) => {
  const { title, items } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      <h4 style={{ margin: "0 0 8px", color: "#333" }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: 4, color: "#555", lineHeight: 1.5 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
};
