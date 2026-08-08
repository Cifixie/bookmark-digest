import type { BaseComponentProps } from "@json-render/react";
import type { TLDRProps } from "@bookmark-digest/catalog";

export const TLDR = ({ props }: BaseComponentProps<TLDRProps>) => {
  const { label, points } = props;
  return (
    <div style={{
      background: "#f5f5f5",
      borderRadius: "8px",
      padding: "16px 20px",
      margin: "12px 0",
    }}>
      <strong style={{ display: "block", marginBottom: 8, color: "#333" }}>{label}</strong>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {points.map((point, i) => (
          <li key={i} style={{ marginBottom: 4, color: "#555" }}>{point}</li>
        ))}
      </ul>
    </div>
  );
};
