import { z } from "zod";
import { difficulty, sourceHealthStatus } from "../../enums";

/**
 * The source variant for written content (articles, blog posts, newsletters).
 * Only present when source.kind === "written".
 */
export const writtenSchema = z.object({
  /** Author or creator name. */
  author: z.string(),
  /** Publication / site name. */
  publication: z.string(),
  /** Publication date (ISO string). */
  publishDate: z.string().optional(),
  /** Estimated reading time in minutes. */
  readingTimeMinutes: z.number().int().positive().optional(),
  /** Target difficulty level for the digest. */
  difficulty: difficulty.optional(),
  /** Whether the original source is still accessible. */
  healthStatus: sourceHealthStatus.optional(),
});
export type Written = z.infer<typeof writtenSchema>;
