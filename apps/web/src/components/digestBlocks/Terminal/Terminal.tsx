import type { TerminalProps } from "@bookmark-digest/catalog";

export const Terminal = (props: TerminalProps) => {
  const { command, output, caption } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{
        background: "var(--code-bg)",
        padding: 12,
        borderRadius: "8px",
        fontFamily: "'Fira Code', 'Consolas', monospace",
        fontSize: 13,
      }}>
        <div style={{ color: "var(--accent-green)" }}>$ {command}</div>
        {output && <pre style={{ margin: "8px 0 0", color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{output}</pre>}
      </div>
      {caption && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{caption}</p>}
    </div>
  );
};
