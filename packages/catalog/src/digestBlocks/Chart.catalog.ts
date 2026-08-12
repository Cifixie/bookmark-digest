import { z } from "zod";

export type ChartDataPoint = z.infer<typeof dataPoint>;

const dataPoint = z.object({
  /** Label for the data point (e.g. category name, time period). */
  label: z.string(),
  /** Numeric value for this data point. */
  value: z.number(),
});

export type ChartProps = z.infer<typeof props>;

export const props = z.object({
  /** Chart visual style: "bar" renders vertical bars; "sparkline" renders a minimal line. */
  variant: z.enum(["bar", "sparkline"]).default("bar"),
  /** Ordered data points to chart. */
  data: z.array(dataPoint).min(1),
  /** Unit applied to values (e.g. "ms", "%", "pages") — displayed in the caption. */
  unit: z.string().optional(),
  /** Short contextual caption under the chart. */
  caption: z.string().optional(),
});

export const description =
  "Data visualization. Renders a bar chart (default) or sparkline for quantitative content — trends, rankings, or distributions. Use when the source contains multiple related numbers that benefit from visual comparison (e.g. 'Framework A averages 12ms, B averages 45ms, C averages 8ms across 5 scenarios'). Disambiguation: use this only for multi-value quantitative data. For a single number, use StatCard. For qualitative qualitative comparisons with text cells, use ComparisonTable. variant='sparkline' is for compact trend lines with few data points (≤8); variant='bar' is for ranked or side-by-side comparisons.";
