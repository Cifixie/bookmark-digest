import { z } from "zod";

export type ProseProps = z.infer<typeof props>;

export const props = z.object({
  /** One or more body-text paragraphs. */
  paragraphs: z.array(z.string()).default([]),
});

export const description =
  "Plain flowing body text — one or more ordinary paragraphs, no card chrome or background. This is the connective-tissue block: use it to link two other blocks together, generalize a pattern the source itself draws out, or carry reasoning that a discrete card/stat/callout would flatten into an isolated fact. Reach for it whenever the source shows its work connecting ideas, not only when nothing else fits.";
