import type { BaseComponentProps } from "@json-render/react";
import type { CardProps } from "@bookmark-digest/catalog";

export const Card = ({ props }: BaseComponentProps<CardProps>) => {
  const { title, subtitle, text } = props;
  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "16px 20px",
      margin: "12px 0",
      background: "#fafafa",
    }}>
      <h4 style={{ margin: "0 0 4px", color: "#222" }}>{title}</h4>
      {subtitle && <p style={{ margin: "0 0 8px", color: "#777", fontSize: 14 }}>{subtitle}</p>}
      {text && <p style={{ margin: 0, color: "#555", lineHeight: 1.5 }}>{text}</p>}
    </div>
  );
};
