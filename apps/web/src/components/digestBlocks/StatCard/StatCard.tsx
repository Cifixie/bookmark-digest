import type { StatCardProps } from "@bookmark-digest/catalog";

export const StatCard = (props: StatCardProps) => {
  const { value, label, change } = props;
  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "20px",
      margin: "12px 0",
      background: "var(--bg-card)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text-heading)" }}>{value}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 4 }}>{label}</div>
      {change && <div style={{ color: "#4caf50", fontSize: 14, fontWeight: 500 }}>{change}</div>}
    </div>
  );
};
