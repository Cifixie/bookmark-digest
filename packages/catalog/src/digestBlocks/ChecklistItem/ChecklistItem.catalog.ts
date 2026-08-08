import { z } from "zod";

export type ChecklistItemProps = z.infer<typeof props>;

export const props = z.object({
  /** The checklist item text. */
  text: z.string(),
  /** Whether this item is checked/completed. */
  checked: z.boolean().optional(),
});

export const description =
  "A single checklist item with optional checked state. Use inside a List component. Supports toggle via json-render state — the renderer handles the checkbox interaction.";
