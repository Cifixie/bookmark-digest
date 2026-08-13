import type { TLDRProps } from "@bookmark-digest/catalog";

export const TLDR = (props: TLDRProps) => {
  const { label, points } = props;
  return (
    <div style={{
      background: "var(--bg-card)",
      borderRadius: "8px",
      padding: "16px 20px",
      margin: "12px 0",
    }}>
      <strong style={{ display: "block", marginBottom: 8, color: "#333" }}>{label}</strong>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {points.map((point, i) => (
          <li key={i} style={{ marginBottom: 4, color: "var(--text-primary)" }}>{point}</li>
        ))}
      </ul>
    </div>
  );
};
