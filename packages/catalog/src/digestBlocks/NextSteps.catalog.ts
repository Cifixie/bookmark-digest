import { z } from "zod";

export type NextStepsProps = z.infer<typeof props>;

export const props = z.object({
  /** Title for the next-steps section (e.g. "Next steps"). */
  title: z.string().default("Next steps"),
  /** Ordered list of recommended next actions or follow-up items. */
  steps: z.array(z.string()).default([]),
});

export const description =
  "Numbered next-steps list. Use at the end of a digest to recommend what the reader should do or read next. Ordered list with 2-5 actionable items.";
