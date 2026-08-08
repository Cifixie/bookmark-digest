import type { BaseComponentProps } from "@json-render/react";
import type { StatCardProps } from "@bookmark-digest/catalog";

export const StatCard = ({ props }: BaseComponentProps<StatCardProps>) => {
  const { value, label, change } = props;
  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "20px",
      margin: "12px 0",
      background: "#fafafa",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#222" }}>{value}</div>
      <div style={{ color: "#777", fontSize: 14, marginBottom: 4 }}>{label}</div>
      {change && <div style={{ color: "#4caf50", fontSize: 14, fontWeight: 500 }}>{change}</div>}
    </div>
  );
};
