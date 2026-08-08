import { z } from "zod";

export type CodeBlockProps = z.infer<typeof props>;

export const props = z.object({
  /** Programming language or content type for the label. Null for plain text/config. */
  language: z.string().nullable().default(null),
  /** The code or markup content. Preserves whitespace. */
  code: z.string(),
  /** Optional caption or explanation below the code block. */
  caption: z.string().nullable().default(null),
});

export const description =
  "A block of source code or config. Preserves whitespace. Set 'language' for the label. Use for any code, config, or markup shown in a technical digest.";
