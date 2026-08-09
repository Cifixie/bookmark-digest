import { z } from "zod";

export type ListProps = z.infer<typeof props>;

export const props = z.object({
  /** Optional title to label the group (e.g. "FAQ", "Key terms"). Omit when a DigestSection heading already introduces the list. */
  title: z.string().nullable().default(null),
});

export const description =
  "Generic titled container for a vertical list of same-typed item components — checklist items, FAQ entries, glossary terms, key moments/quotes, speakers, links, decisions, chapters, cautions (use Callout), steps, or timeline events. Set 'title' to label the group; omit it when a DigestSection heading already introduces the list.";
