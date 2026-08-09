import { z } from "zod";

export type LinkItemProps = z.infer<typeof props>;

export const props = z.object({
  /** Link text displayed to the user. */
  text: z.string(),
  /** The href URL the link points to. */
  href: z.string().url(),
  /** Optional description of what the link is for. */
  description: z.string().nullable().default(null),
});

export const description =
  "A single link item with text, URL, and optional description. Use inside a List component when multiple links are grouped together (related readings, sources, references).";
