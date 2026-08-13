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
  info: { bg: "var(--callout-info-bg)", border: "var(--callout-info-border)", text: "var(--callout-info-text)" },
  tip: { bg: "var(--callout-tip-bg)", border: "var(--callout-tip-border)", text: "var(--callout-tip-text)" },
  warning: { bg: "var(--callout-warning-bg)", border: "var(--callout-warning-border)", text: "var(--callout-warning-text)" },
  success: { bg: "var(--callout-success-bg)", border: "var(--callout-success-border)", text: "var(--callout-success-text)" },
  note: { bg: "var(--callout-note-bg)", border: "var(--callout-note-border)", text: "var(--callout-note-text)" },
  analogy: { bg: "var(--callout-analogy-bg)", border: "var(--callout-analogy-border)", text: "var(--callout-analogy-text)" },
  "big-idea": { bg: "var(--callout-big-idea-bg)", border: "var(--callout-big-idea-border)", text: "var(--callout-big-idea-text)" },
  takeaway: { bg: "var(--callout-takeaway-bg)", border: "var(--callout-takeaway-border)", text: "var(--callout-takeaway-text)" },
  "why-it-matters": { bg: "var(--callout-why-it-matters-bg)", border: "var(--callout-why-it-matters-border)", text: "var(--callout-why-it-matters-text)" },
  misconception: { bg: "var(--callout-misconception-bg)", border: "var(--callout-misconception-border)", text: "var(--callout-misconception-text)" },
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
