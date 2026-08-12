import { z } from "zod";

export type ComparisonNarrativeProps = z.infer<typeof props>;

export const props = z.object({
  /** Shared heading for the comparison (e.g. "Netscape vs Google vs OpenAI"). */
  title: z.string(),
  /** Optional clarifying subtitle beneath the heading. */
  subtitle: z.string().optional(),
  /**
   * The throughline — what connects these entities.
   * Required: a shared question, pattern, archetype, or role that the model
   * states explicitly rather than leaving the reader to infer from adjacency.
   * If you can't state one, this belongs in a Grid, not a ComparisonNarrative.
   */
  throughline: z.string(),
});

export const description =
  "Entity-first comparison — profiles 2+ named things (companies, products, people, eras, ideas) and states explicitly what connects them. Use when entities are compared by role, trajectory, or analogy rather than shared explicit criteria (that's ComparisonTable). Each child is a Card (for a named thing the source discusses) or AuthorCard (for a specific source). Requires a non-empty throughline — if the model cannot state a real shared question, pattern, or archetype between the entities, use Grid instead. Disambiguation: vs Grid, the mandatory throughline is the differentiator; vs TimelineEvent, entities are parallel not ordered by date; vs ComparisonTable, entities are compared by role not shared dimensions.";
