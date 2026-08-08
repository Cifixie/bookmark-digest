import { z } from "zod";

/**
 * A speaker / host / guest identified within a temporal (video/podcast) source.
 * Only present when source.kind === "temporal".
 */
export const speakerSchema = z.object({
  /** Person's name. */
  name: z.string(),
  /** Their role in the piece (e.g. "host", "guest", "co-host"). */
  role: z.string().optional(),
});
export type Speaker = z.infer<typeof speakerSchema>;
