import { z } from "zod";

export type PrerequisitesProps = z.infer<typeof props>;

export const props = z.object({
  /** Title for the prerequisites section (e.g. "Prerequisites"). */
  title: z.string().default("Prerequisites"),
  /** List of prerequisites the reader should have before continuing. */
  items: z.array(z.string()).default([]),
});

export const description =
  "Prerequisites checklist shown before the main content. Use at the top of a digest to tell readers what they should already know or have set up. Bullet list of 0-5 items.";
