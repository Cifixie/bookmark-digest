import { z } from "zod";

export type TLDRProps = z.infer<typeof props>;

export const props = z.object({
  /** Label displayed above the points. Defaults to "TL;DR". */
  label: z.string().default("TL;DR"),
  /** Scannable bullet points — 3-6 short items recommended. */
  points: z.array(z.string()).default([]),
});

export const description =
  "Scannable bullet summary of the whole piece. Place near the top. 3-6 short points.";
