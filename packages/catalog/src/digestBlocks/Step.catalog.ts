import { z } from "zod";

export type StepProps = z.infer<typeof props>;

export const props = z.object({
  /** Step number (for ordering). */
  order: z.number().int().positive(),
  /** Title or heading for this step. */
  title: z.string(),
  /** Detailed instructions for this step. */
  description: z.string(),
});

export const description =
  "A single ordered step in a tutorial or guide. Use inside a List component when multiple steps form a procedure. Renders with an ordered number, title, and description.";
