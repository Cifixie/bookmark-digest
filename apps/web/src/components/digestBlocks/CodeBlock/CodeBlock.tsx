import type { BaseComponentProps } from "@json-render/react";
import type { CodeBlockProps } from "@bookmark-digest/catalog";

export const CodeBlock = ({ props }: BaseComponentProps<CodeBlockProps>) => {
  const { language, code, caption } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      {language && (
        <div style={{
          background: "#333",
          color: "#eee",
          padding: "4px 12px",
          fontSize: 12,
          borderRadius: "8px 8px 0 0",
        }}>
          {language}
        </div>
      )}
      <pre style={{
        margin: 0,
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: 16,
        borderRadius: language ? "0 0 8px 8px" : "8px",
        overflow: "auto",
        fontSize: 13,
        fontFamily: "'Fira Code', 'Consolas', monospace",
        lineHeight: 1.5,
      }}>
        <code>{code}</code>
      </pre>
      {caption && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>{caption}</p>}
    </div>
  );
};
