import type { ComparisonNarrativeProps } from "@bookmark-digest/catalog";

/**
 * ComparisonNarrative — renders 2+ named entities with an explicit throughline.
 *
 * Rendered via Registry's Wrapped wrapper which injects { children } as a prop.
 * The Zod props schema only has title/subtitle/throughline.
 */
export const ComparisonNarrative = ({
  title,
  subtitle,
  throughline,
  children,
}: ComparisonNarrativeProps & { children?: React.ReactNode }) => {
  return (
    <div style={{ margin: "16px 0" }}>
      {/* Header */}
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#222" }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "#777" }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Throughline — visual weight, not a buried caption */}
      <div
        style={{
          margin: "10px 0",
          padding: "8px 12px",
          borderLeft: "3px solid #1a73e8",
          background: "#f0f6ff",
          borderRadius: 4,
          fontSize: 14,
          lineHeight: 1.5,
          color: "#333",
        }}
      >
        {throughline}
      </div>

      {/* Entity cards in a responsive grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
};
