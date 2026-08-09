import { z } from "zod";

export type GlossaryTermProps = z.infer<typeof props>;

export const props = z.object({
  /** The term being defined. */
  term: z.string(),
  /** Definition or explanation of the term. */
  definition: z.string(),
});

export const description =
  "A single glossary term-definition pair. Use inside a List component when multiple terms are grouped. Renders as a named definition entry.";
