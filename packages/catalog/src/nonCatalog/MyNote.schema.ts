import { z } from "zod";

/**
 * MyNote — a user-authored note attached to a digest.
 * NOT LLM-authored; uses a standalone schema and is embedded into the
 * DigestPage separately by the page shell renderer.
 */
export const myNoteSchema = z.object({
  /** Free-form note text the user added. */
  text: z.string(),
  /** When the note was created (ISO string). */
  createdAt: z.string(),
});
export type MyNote = z.infer<typeof myNoteSchema>;
