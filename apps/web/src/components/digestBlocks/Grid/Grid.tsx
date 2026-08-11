import type { GridProps } from "@bookmark-digest/catalog";

export const Grid = ({ children }: GridProps) => {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
      gap: 16,
      margin: "12px 0",
    }}>
      {children}
    </div>
  );
};
