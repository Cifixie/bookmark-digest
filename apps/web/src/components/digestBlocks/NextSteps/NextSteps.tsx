import type { NextStepsProps } from "@bookmark-digest/catalog";

export const NextSteps = (props: NextStepsProps) => {
  const { title, steps } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      <h4 style={{ margin: "0 0 8px", color: "var(--text-heading)" }}>{title}</h4>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ marginBottom: 6, color: "var(--text-primary)", lineHeight: 1.5 }}>{step}</li>
        ))}
      </ol>
    </div>
  );
};
