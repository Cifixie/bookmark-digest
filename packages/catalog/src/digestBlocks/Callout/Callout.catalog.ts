import { z } from "zod";

export type CalloutProps = z.infer<typeof props>;

export const props = z.object({
  /** Visual/style variant — sets both icon and default label. */
  variant: z.enum([
    "info",
    "tip",
    "warning",
    "success",
    "note",
    "analogy",
    "big-idea",
    "takeaway",
    "why-it-matters",
    "misconception",
  ]),
  /** Override the default label; omit to auto-select from variant. */
  title: z.string().nullable().default(null),
  /** Body text of the callout. */
  text: z.string(),
});

export const description = `A colored callout box. "variant" sets both tone and icon: info, tip, warning, success, note for asides/cautions; analogy, big-idea, takeaway, why-it-matters for those specific beginner-summary blocks; misconception absorbs the old MythVsReality for common-false-belief blocks. "title" overrides the default label for the variant — omit it to use the default (e.g. "Why it matters"). Use this for any single-point emphasis block instead of a bespoke component.`;
