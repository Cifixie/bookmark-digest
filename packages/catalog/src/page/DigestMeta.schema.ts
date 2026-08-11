import { z } from "zod";
import { tone, length, difficulty, digestType, subject } from "../enums";

/**
 * DigestMeta — AI-generated metadata about the digest itself.
 * Not registered in defineCatalog; part of the page shell.
 */
export const digestMetaSchema = z.object({
  /** Category of original content. */
  digestType: digestType,
  /** Tone of the digest explanation. */
  tone: tone.default("conversational"),
  /** Approximate reading length. */
  length: length.default("medium"),
  /** Target difficulty level. */
  difficulty: difficulty.optional(),
  /** Broad topic domain — primary browse/filter facet. See enums.ts for why this is a fixed enum rather than free text. */
  subject: subject,
  /**
   * Narrower topic descriptors (e.g. "CSS", "Design Systems"), 1-6 per
   * digest. Free-ish by design — this is the search/refinement layer, not
   * the primary filter, so occasional inconsistency matters less than for
   * `subject`.
   */
  tags: z.array(z.string()).min(1).max(6).optional(),
  /** When the digest was generated (ISO string). */
  generatedAt: z.string().optional(),
});
export type DigestMeta = z.infer<typeof digestMetaSchema>;
