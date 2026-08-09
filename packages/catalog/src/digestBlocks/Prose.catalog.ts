import { z } from "zod";

export type ProseProps = z.infer<typeof props>;

export const props = z.object({
  /** One or more body-text paragraphs. */
  paragraphs: z.array(z.string()).default([]),
});

export const description =
  "Plain flowing body text — one or more ordinary paragraphs, no card chrome or background. Use for narrative explanation inside a DigestSection when the content doesn't need a card, callout, or other stylized block.";
