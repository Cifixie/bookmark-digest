import { z } from "zod";

export type CardProps = z.infer<typeof props>;

export const props = z.object({
  /** Card title. */
  title: z.string(),
  /** Optional card subtitle or summary line. */
  subtitle: z.string().nullable().default(null),
  /** Card body text or description. */
  text: z.string().optional(),
});

export const description =
  "Standard card with title, optional subtitle, and text body. Use for standalone content cards, reference cards, or summary blocks that need visual separation.";
