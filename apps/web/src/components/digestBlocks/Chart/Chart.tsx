import type { ChartProps } from "@bookmark-digest/catalog";

/** Minimal color scale for bar heights. */
const barColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export const Chart = (props: ChartProps) => {
  const { variant, data, unit, caption } = props;

  if (variant === "sparkline") {
    return <Sparkline data={data} unit={unit} caption={caption} />;
  }

  return <BarChart data={data} unit={unit} caption={caption} />;
};

/* ------------------------------------------------------------------ */
/* Bar chart — vertical div-based bars with optional axis label      */
/* ------------------------------------------------------------------ */

function BarChart({
  data,
  unit: _unit,
  caption,
}: Omit<ChartProps, "variant">) {
  const max = Math.max(...data.map((d) => d.value));
  const safeMax = max || 1;

  return (
    <div style={{ margin: "16px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 160,
          padding: "0 8px",
          borderBottom: "1px solid var(--border-primary)",
          borderLeft: "1px solid var(--border-primary)",
        }}
      >
        {data.map((d, i) => {
          const height = Math.max((d.value / safeMax) * 100, 4);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                {d.value}
                {_unit ? ` ${_unit}` : ""}
              </span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 48,
                  height: `${height}%`,
                  backgroundColor: barColors[i % barColors.length],
                  borderRadius: "4px 4px 0 0",
                  minHeight: 4,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-primary)",
                  marginTop: 4,
                  textAlign: "center",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      {caption && (
        <p
          style={{
            margin: "8px 8px 0",
            color: "var(--text-muted)",
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — minimal inline SVG line                               */
/* ------------------------------------------------------------------ */

function Sparkline({
  data,
  unit: _unit,
  caption,
}: Omit<ChartProps, "variant">) {
  if (data.length < 2) {
    // Fallback for single-point data: show as a single bar
    return <BarChart data={data} unit={_unit} caption={caption} />;
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 400;
  const height = 80;
  const padX = 40;
  const padY = 10;

  const points = data
    .map((d, i) => {
      const x = padX + (i / (data.length - 1)) * (width - 2 * padX);
      const y = height - padY - ((d.value - min) / range) * (height - 2 * padY);
      return `${x},${y}`;
    })
    .join(" ");

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];

  return (
    <div style={{ margin: "16px 0" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", maxWidth: 400, height: "auto" }}
      >
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End dot */}
        <circle
          cx={
            padX + ((data.length - 1) / (data.length - 1)) * (width - 2 * padX)
          }
          cy={
            height -
            padY -
            ((lastPoint.value - min) / range) * (height - 2 * padY)
          }
          r={4}
          fill="var(--accent-blue)"
        />
        {/* Start dot */}
        <circle cx={padX}
          cy={
            height -
            padY -
            ((firstPoint.value - min) / range) * (height - 2 * padY)
          }
          r={3}
          fill="var(--accent-blue)"
          opacity={0.5}
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        <span>
          {firstPoint.label}
          {firstPoint.value}
          {_unit ? ` ${_unit}` : ""}
        </span>
        <span>
          {lastPoint.label}
          {lastPoint.value}
          {_unit ? ` ${_unit}` : ""}
        </span>
      </div>
      {caption && (
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--text-muted)",
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
