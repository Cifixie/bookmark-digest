import type { ListProps } from "@bookmark-digest/catalog";

export const List = (props: ListProps) => {
  const { title } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      {title && <h4 style={{ margin: "0 0 8px", color: "var(--text-heading)" }}>{title}</h4>}
      <div />
    </div>
  );
};
