import { z } from "zod";

export type GridProps = z.infer<typeof props>;

export const props = z.object({});

export const description =
  "Responsive grid container for card-like items — Card, StatCard, or Pillar children. Pick the item component that fits the content; Grid just arranges whichever one you nest. Pass child element keys to arrange them.";
