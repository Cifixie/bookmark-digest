import { z } from "zod";

export type AuthorCardProps = z.infer<typeof props>;

export const props = z.object({
  /** Author or source name to attribute (e.g. "Source 1", "Reviewer A", "Mozilla"). */
  name: z.string(),
  /** The claim, quote, or finding attributed to this source. */
  text: z.string(),
  /** Optional source type label (article, review, report, video, etc.). */
  type: z.string().optional(),
  /** URL of the original source (optional — shown as a link or muted text). */
  url: z.string().optional(),
  /** Optional secondary attribution context (e.g. "Published Jan 2026"). */
  context: z.string().optional(),
});

export const description =
  "Attribution card — attributes a specific claim, quote, or finding back to its source author or document. Essential for multi-source digests where the model synthesizes across N inputs. Use this inline (inside prose sections) whenever the model presents information that came from one specific source rather than being common knowledge or a model inference. Shows name, text, and optional url/context for traceability.";
