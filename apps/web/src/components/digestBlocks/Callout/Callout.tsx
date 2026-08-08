import type { BaseComponentProps } from "@json-render/react";
import type { CalloutProps } from "@bookmark-digest/catalog";

const icons: Record<CalloutProps["variant"], string> = {
  info: "ℹ️",
  tip: "💡",
  warning: "⚠️",
  success: "✅",
  note: "📝",
  analogy: "💡",
  "big-idea": "🌟",
  takeaway: "🎯",
  "why-it-matters": "❗",
  misconception: "🚫",
};

const defaultLabels: Record<CalloutProps["variant"], string> = {
  info: "Info",
  tip: "Tip",
  warning: "Warning",
  success: "Success",
  note: "Note",
  analogy: "Think of it like…",
  "big-idea": "The Big Idea",
  takeaway: "Key Takeaway",
  "why-it-matters": "Why it matters",
  misconception: "Common Misconception",
};

const variantColors: Record<CalloutProps["variant"], { bg: string; border: string; text: string }> = {
  info: { bg: "#e3f2fd", border: "#2196f3", text: "#0d47a1" },
  tip: { bg: "#e8f5e9", border: "#4caf50", text: "#1b5e20" },
  warning: { bg: "#fff3e0", border: "#ff9800", text: "#e65100" },
  success: { bg: "#e8f5e9", border: "#2e7d32", text: "#1b5e20" },
  note: { bg: "#f3e5f5", border: "#9c27b0", text: "#4a148c" },
  analogy: { bg: "#e3f2fd", border: "#2196f3", text: "#0d47a1" },
  "big-idea": { bg: "#fff8e1", border: "#ffc107", text: "#f57f17" },
  takeaway: { bg: "#e8f5e9", border: "#4caf50", text: "#1b5e20" },
  "why-it-matters": { bg: "#fce4ec", border: "#e91e63", text: "#880e4f" },
  misconception: { bg: "#ffebee", border: "#f44336", text: "#b71c1c" },
};

export const Callout = ({ props }: BaseComponentProps<CalloutProps>) => {
  const { variant, title, text } = props;
  const colors = variantColors[variant];
  const label = title ?? defaultLabels[variant];

  return (
    <div style={{
      background: colors.bg,
      borderLeft: `4px solid ${colors.border}`,
      padding: "12px 16px",
      borderRadius: "4px",
      margin: "12px 0",
    }}>
      <div style={{
        fontWeight: 600,
        color: colors.text,
        marginBottom: 4,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span>{icons[variant]}</span>
        {label}
      </div>
      <p style={{ margin: 0, color: colors.text, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
};
