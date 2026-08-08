import { z } from "zod";

/**
 * RelatedFromYourBookmarks — a section generated from vector-search retrieval
 * of the user's bookmark archive. NOT LLM-authored; uses a standalone schema
 * and its own resolver/workflow, embedded into the DigestPage separately.
 */
export const relatedFromYourBookmarksSchema = z.object({
  /** How many related bookmarks to show. */
  count: z.number().int().positive().default(3),
  /** Optional heading to show above the related items. */
  heading: z.string().default("Related from your bookmarks"),
});
export type RelatedFromYourBookmarks = z.infer<typeof relatedFromYourBookmarksSchema>;
