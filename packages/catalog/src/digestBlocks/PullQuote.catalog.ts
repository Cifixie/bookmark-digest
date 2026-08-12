import { z } from "zod";

export type PullQuoteProps = z.infer<typeof props>;

export const props = z.object({
  /** Single-sentence emphasis extracted from the content. No attribution — use QuoteBlock when attribution is available. */
  text: z.string(),
});

export const description =
  "Visual emphasis break for a single impactful sentence. Renders in large type with no attribution box or border. Use this to break up long Prose runs in summary/understand digests and draw attention to a key insight. Disambiguation: use this ONLY when no attribution is available or the quote is unattributed within the source. If you have a speaker/author name, use QuoteBlock instead. PullQuote is for the sentence that pops — not for every quote.";
