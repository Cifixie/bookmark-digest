import type { BaseComponentProps } from "@json-render/react";
import type { ChecklistItemProps } from "@bookmark-digest/catalog";

export const ChecklistItem = ({ props }: BaseComponentProps<ChecklistItemProps>) => {
  const { text, checked } = props;
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "4px 0",
      color: checked ? "#888" : "#333",
      textDecoration: checked ? "line-through" : "none",
    }}>
      <span style={{ minWidth: 18, fontSize: 16 }}>{checked ? "☑" : "☐"}</span>
      <span>{text}</span>
    </div>
  );
};
