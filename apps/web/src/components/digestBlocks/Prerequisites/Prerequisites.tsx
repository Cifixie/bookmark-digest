import type { PrerequisitesProps } from "@bookmark-digest/catalog";

export const Prerequisites = (props: PrerequisitesProps) => {
  const { title, items } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      <h4 style={{ margin: "0 0 8px", color: "var(--text-heading)" }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: 4, color: "var(--text-primary)", lineHeight: 1.5 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
};
