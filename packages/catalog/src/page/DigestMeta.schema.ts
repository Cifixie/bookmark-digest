import { z } from "zod";
import { tone, length, difficulty, digestType } from "../enums";

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
  /** When the digest was generated (ISO string). */
  generatedAt: z.string().optional(),
});
export type DigestMeta = z.infer<typeof digestMetaSchema>;
