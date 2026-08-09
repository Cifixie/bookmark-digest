import { z } from "zod";

export type StatCardProps = z.infer<typeof props>;

export const props = z.object({
  /** The primary number or metric displayed. */
  value: z.string(),
  /** Label or description of what the stat represents. */
  label: z.string(),
  /** Optional change indicator (e.g. "+12%", "-3"). */
  change: z.string().nullable().default(null),
});

export const description =
  "Number-focused card for metrics, KPIs, statistics, or quantified takeaways. Shows a large value with a label and optional change indicator.";
