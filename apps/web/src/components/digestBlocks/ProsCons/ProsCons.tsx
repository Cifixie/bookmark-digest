import type { ProsConsProps } from "@bookmark-digest/catalog";

export const ProsCons = (props: ProsConsProps) => {
  const { prosTitle, pros, consTitle, cons } = props;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "12px 0" }}>
      <div>
        <h4 style={{ margin: "0 0 8px", color: "#2e7d32" }}>{prosTitle}</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {pros.map((p, i) => (
            <li key={i} style={{ marginBottom: 4, color: "#555" }}>{p}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 style={{ margin: "0 0 8px", color: "#c62828" }}>{consTitle}</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {cons.map((c, i) => (
            <li key={i} style={{ marginBottom: 4, color: "#555" }}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
