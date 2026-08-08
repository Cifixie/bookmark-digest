import { z } from "zod";

export type FaqItemProps = z.infer<typeof props>;

export const props = z.object({
  /** The question being answered. */
  question: z.string(),
  /** The answer text. */
  answer: z.string(),
});

export const description =
  "A single FAQ Q&A pair. Use inside a List component when multiple FAQ items are grouped. Supports disclosure (toggle expand/collapse) via json-render state and visibility.";
