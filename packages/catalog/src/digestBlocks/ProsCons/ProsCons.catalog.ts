import { z } from "zod";

export type ProsConsProps = z.infer<typeof props>;

export const props = z.object({
  /** Title for the pros section (e.g. "Pros"). */
  prosTitle: z.string().default("Pros"),
  /** List of positive points. */
  pros: z.array(z.string()).default([]),
  /** Title for the cons section (e.g. "Cons"). */
  consTitle: z.string().default("Cons"),
  /** List of negative points or drawbacks. */
  cons: z.array(z.string()).default([]),
});

export const description =
  "Side-by-side pros and cons comparison. Use for balanced evaluations, product/tool comparisons, or when presenting trade-offs. Two columns of bullet points.";
