import { z } from "zod";
import { sourceHealthStatus } from "../../enums";

/**
 * SourceMeta — metadata about the original source.
 * Shown below the hero, above sections.
 * Not registered in defineCatalog; part of the page shell.
 */
export const sourceMetaSchema = z.object({
  /** Source kind discriminator (written | temporal). */
  kind: z.enum(["written", "temporal"]),
  /** Author or show/presenter name. */
  author: z.string(),
  /** Publication or show name. */
  publication: z.string().optional(),
  /** Publication or upload date (ISO string). */
  publishDate: z.string().optional(),
  /** Estimated reading time in minutes (written only). */
  readingTimeMinutes: z.number().int().positive().optional(),
  /** Whether the original source is still accessible. */
  healthStatus: sourceHealthStatus.optional(),
});
export type SourceMeta = z.infer<typeof sourceMetaSchema>;
