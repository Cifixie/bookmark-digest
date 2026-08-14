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
  /**
   * Broad topic domain — primary browse/filter facet. See enums.ts for why
   * this is a fixed enum rather than free text.
   *
   * Optional until something actually produces it: DigestMeta isn't part of
   * the catalog prompt, so no generated digest carries a subject yet, and
   * Phase 3 will need a backfill regardless. Tighten to required once the
   * generator fills it in — see plans/phase-3-browse-search.md.
   */
  subject: subject.optional(),
  /**
   * Narrower topic descriptors (e.g. "CSS", "Design Systems"), 1-6 per
   * digest. Free-ish by design — this is the search/refinement layer, not
   * the primary filter, so occasional inconsistency matters less than for
   * `subject`.
   */
  tags: z.array(z.string()).min(1).max(6).optional(),
  /**
   * Two-sentence summary of what the digest covers — written for a human
   * scanning search results. Optional for backward compat with existing
   * digests that were generated before this field existed.
   */
  synopsis: z.string().max(500).optional(),
  /** When the digest was generated (ISO string). */
  generatedAt: z.string().optional(),
});
export type DigestMeta = z.infer<typeof digestMetaSchema>;
