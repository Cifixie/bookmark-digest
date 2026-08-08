import type { BaseComponentProps } from "@json-render/react";
import type { ListProps } from "@bookmark-digest/catalog";

export const List = ({ props }: BaseComponentProps<ListProps>) => {
  const { title } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      {title && <h4 style={{ margin: "0 0 8px", color: "#333" }}>{title}</h4>}
      <div />
    </div>
  );
};
