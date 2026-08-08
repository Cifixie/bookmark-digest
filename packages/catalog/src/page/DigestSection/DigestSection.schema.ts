import { z } from "zod";

/**
 * DigestSection — a titled section of content within a DigestPage.
 * Not registered in defineCatalog; part of the page shell.
 */
export const digestSectionSchema = z.object({
  /** Section heading (e.g. "Key Takeaways", "Background"). */
  heading: z.string(),
  /** Optional descriptive subtitle. */
  subtitle: z.string().nullable().default(null),
  /** Anchor ID for deep-linking to this section. */
  anchorId: z.string().optional(),
  /** Array of content blocks that fill this section. */
  content: z.array(z.string()).default([]),
});
export type DigestSection = z.infer<typeof digestSectionSchema>;
