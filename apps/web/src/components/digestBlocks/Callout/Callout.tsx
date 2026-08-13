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
  info: { bg: "#0d2a47", border: "#2196f3", text: "#90caf9" },
  tip: { bg: "#1a3a2a", border: "#4caf50", text: "#a5d6a7" },
  warning: { bg: "#3d2a10", border: "#ff9800", text: "#ffcc80" },
  success: { bg: "#1a3a2a", border: "#2e7d32", text: "#a5d6a7" },
  note: { bg: "#2a1a3a", border: "#9c27b0", text: "#ce93d8" },
  analogy: { bg: "#0d2a47", border: "#2196f3", text: "#90caf9" },
  "big-idea": { bg: "#3d3210", border: "#ffc107", text: "#fff59d" },
  takeaway: { bg: "#1a3a2a", border: "#4caf50", text: "#a5d6a7" },
  "why-it-matters": { bg: "#3d1528", border: "#e91e63", text: "#f48fb1" },
  misconception: { bg: "#3d1a1a", border: "#f44336", text: "#ef9a9a" },
};

export const Callout = (props: CalloutProps) => {
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
