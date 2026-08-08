import { z } from "zod";

/**
 * DigestFooter — the bottom section of a DigestPage.
 * Not registered in defineCatalog; part of the page shell.
 */
export const digestFooterSchema = z.object({
  /** Footnote, source attribution, or disclaimer text. */
  content: z.string().optional(),
});
export type DigestFooter = z.infer<typeof digestFooterSchema>;
