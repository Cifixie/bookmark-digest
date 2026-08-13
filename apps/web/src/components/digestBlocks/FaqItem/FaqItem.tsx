import type { FaqItemProps } from "@bookmark-digest/catalog";
import { useState } from "react";

export const FaqItem = (props: FaqItemProps) => {
  const [open, setOpen] = useState(false);
  const { question, answer } = props;
  return (
    <div style={{ border: "1px solid var(--border-primary)", borderRadius: "8px", margin: "8px 0", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "12px 16px",
          background: open ? "var(--bg-card)" : "var(--bg-muted)",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          fontWeight: 500,
          color: "var(--text-heading)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{question}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "12px 16px", background: "var(--bg-card)", lineHeight: 1.6, color: "var(--text-primary)" }}>
          {answer}
        </div>
      )}
    </div>
  );
};
