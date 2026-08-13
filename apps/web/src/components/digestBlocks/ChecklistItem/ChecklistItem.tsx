import type { ChecklistItemProps } from "@bookmark-digest/catalog";

export const ChecklistItem = (props: ChecklistItemProps) => {
  const { text, checked } = props;
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "4px 0",
      color: checked ? "var(--text-muted)" : "var(--text-primary)",
      textDecoration: checked ? "line-through" : "none",
    }}>
      <span style={{ minWidth: 18, fontSize: 16 }}>{checked ? "☑" : "☐"}</span>
      <span>{text}</span>
    </div>
  );
};
