import { z } from "zod";

/**
 * DigestHero — the top hero section of a DigestPage.
 * Its shape is determined by the source.kind (written vs. temporal).
 * Not registered in defineCatalog; it's part of the page shell.
 */
export const digestHeroSchema = z.object({
  /** Primary headline/title of the digest. */
  title: z.string(),
  /** Optional subtitle or source attribution. */
  subtitle: z.string().nullable().default(null),
});
export type DigestHero = z.infer<typeof digestHeroSchema>;
