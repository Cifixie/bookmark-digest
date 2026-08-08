import { z } from "zod";
import { chapterSchema } from "../Chapter/Chapter.schema";
import { speakerSchema as speakerType } from "../Speaker/Speaker.schema";

/**
 * The source variant for temporal content (videos, podcasts).
 * Only present when source.kind === "temporal".
 *
 * NOTE: hasVideo deliberately replaces a separate video/podcast sub-type.
 * When false, it may be an audio-only podcast. Do not re-split.
 */
export const temporalSchema = z.object({
  /** Title of the video/podcast. */
  title: z.string(),
  /** Name of the show, channel, or production. */
  showName: z.string(),
  /** Duration in seconds (estimated). */
  duration: z.number().int().positive().optional(),
  /** URL to the media player or original content. */
  mediaUrl: z.string().url().optional(),
  /** Whether this is a video (vs. audio-only podcast). */
  hasVideo: z.boolean(),
  /** Direct link to the original source. */
  sourceLink: z.string().url(),
  /** Optional chapter markers — only present if the source provides them. */
  chapters: z.array(chapterSchema).optional(),
  /** Optional speaker / host / guest list — only present if identifiable. */
  speakers: z.array(speakerType).optional(),
});
export type Temporal = z.infer<typeof temporalSchema>;
