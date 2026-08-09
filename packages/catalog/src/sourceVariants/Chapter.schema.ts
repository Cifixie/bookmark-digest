import { z } from "zod";

/**
 * A chapter marker within a temporal (video/podcast) source.
 * Only present when source.kind === "temporal".
 */
export const chapterSchema = z.object({
  /** Zero-indexed timestamp in seconds where this chapter starts. */
  timestampSeconds: z.number().int().nonnegative(),
  /** Human-readable chapter title. */
  title: z.string(),
  /** Optional short description of what's covered in this chapter. */
  description: z.string().optional(),
});
export type Chapter = z.infer<typeof chapterSchema>;
