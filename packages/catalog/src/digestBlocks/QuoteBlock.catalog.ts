import { z } from "zod";

export type QuoteBlockProps = z.infer<typeof props>;

export const props = z.object({
  /** The quote text. */
  quote: z.string(),
  /** Optional attribution (person, source). */
  attribution: z.string().nullable().default(null),
  /** Optional timestamp in seconds — only meaningful when source is temporal (video/podcast). */
  timestampSeconds: z.number().int().nonnegative().optional(),
});

export const description =
  "Quote callout with optional citation and optional timestampSeconds (for temporal sources like videos/podcasts). Use for direct quotes from the source material.";
