import type { CardProps } from "@bookmark-digest/catalog";

export const Card = (props: CardProps) => {
  const { title, subtitle, text } = props;
  return (
    <div style={{
      border: "1px solid var(--border-primary)",
      borderRadius: "8px",
      padding: "16px 20px",
      margin: "12px 0",
      background: "var(--bg-card)",
    }}>
      <h4 style={{ margin: "0 0 4px", color: "var(--text-heading)" }}>{title}</h4>
      {subtitle && <p style={{ margin: "0 0 8px", color: "var(--text-secondary)", fontSize: 14 }}>{subtitle}</p>}
      {text && <p style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.5 }}>{text}</p>}
    </div>
  );
};
