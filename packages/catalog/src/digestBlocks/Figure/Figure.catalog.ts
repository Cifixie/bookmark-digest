import { z } from "zod";

export type FigureProps = z.infer<typeof props>;

export const props = z.object({
  /** Alt text or description of the figure. */
  alt: z.string().optional(),
  /** Optional caption below the figure. */
  caption: z.string().nullable().default(null),
  /** Source or attribution URL. */
  source: z.string().url().optional(),
});

export const description =
  "A figure/image placeholder with optional alt text and caption. Use for diagrams, charts, screenshots, or illustrations referenced in the digest.";
