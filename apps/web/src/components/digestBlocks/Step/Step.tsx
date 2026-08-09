import type { StepProps } from "@bookmark-digest/catalog";

export const Step = (props: StepProps) => {
  const { order, title, description } = props;
  return (
    <div style={{ display: "flex", gap: 12, margin: "12px 0", alignItems: "flex-start" }}>
      <div style={{
        minWidth: 32,
        height: 32,
        borderRadius: "50%",
        background: "#1a73e8",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 14,
      }}>
        {order}
      </div>
      <div>
        <h4 style={{ margin: "0 0 4px", color: "#222" }}>{title}</h4>
        <p style={{ margin: 0, color: "#555", lineHeight: 1.6 }}>{description}</p>
      </div>
    </div>
  );
};
