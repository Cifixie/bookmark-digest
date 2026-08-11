import { z } from "zod";

export type TimelineEventItem = z.infer<typeof timelineEventItem>;

const timelineEventItem = z.object({
  /** Display label for this timeline entry (e.g. "Mozilla 2026", "Source 2 — Jan 2026"). */
  label: z.string(),
  /** ISO date string for ordering (e.g. "2026-01-15"). */
  date: z.string(),
  /** Key finding, change, or event for this point in time. */
  text: z.string(),
  /** Index into the sourceHashes array this entry references (0-based, optional). */
  sourceIndex: z.number().int().min(0).max(99).optional(),
});

export type TimelineEventProps = z.infer<typeof props>;

export const props = z.object({
  /** Chronological events — ordered by date, displayed top-to-bottom. */
  items: z.array(timelineEventItem).min(2).max(12),
  /** Optional overall narrative explaining how the topic evolved across this period. */
  narrative: z.string().optional(),
});

export const description =
  "Vertical timeline for evolution-shaped digests — N sources sampled across time (e.g. 'state of web' 2024→2026, successive monthly roundup posts). Each item has a date, a label naming the source or event, and the key finding/change at that point. The model should present a clear chronological arc showing how perspectives, facts, products, or strategies evolved. Use sourceIndex to link back to the original source. Optional narrative at the end ties the timeline together with a summary of the overall trajectory.";
