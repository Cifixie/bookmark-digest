import type { StepProps } from "@bookmark-digest/catalog";

export const Step = (props: StepProps) => {
  const { order, title, description } = props;
  return (
    <div style={{ display: "flex", gap: 12, margin: "12px 0", alignItems: "flex-start" }}>
      <div style={{
        minWidth: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--brand)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 14,
      }}>
        {order}
      </div>
      <div>
        <h4 style={{ margin: "0 0 4px", color: "var(--text-heading)" }}>{title}</h4>
        <p style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  );
};
