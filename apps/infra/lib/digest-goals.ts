/**
 * Digest goals config — the single source of truth for what digests are
 * available, which catalog blocks each goal may author, and the goal's
 * prompt framing.
 *
 * Imported by:
 *   - apps/infra/lambdas/digest-goals/handler.ts  (GET /digest-goals)
 *   - apps/infra/lambdas/generate-digest/handler.ts (goal config lookup)
 */

export interface DigestGoalConfig {
  goal: string;
  label: string;
  description: string;
  promptTemplate: string;
}

export const DIGEST_GOALS: DigestGoalConfig[] = [
  {
    goal: "tl_dr",
    label: "TL;DR",
    description: "Ultra-short bullet-point summary.",
    promptTemplate: `Give a TL;DR of the following content in 3-5 concise bullet points. Each point should be a single sentence, and together they should capture the essence of the content.`,
  },
  {
    goal: "summary",
    label: "Summary",
    description: "A thorough prose summary of the source content.",
    promptTemplate: `
Consider ALL of the following from content:
- The main thesis or central argument
- Every major section and its key points
- Concrete examples, case studies, or real-world instances mentioned
- Specific recommendations or action items
- Caveats, limitations, or honest criticisms
- Memorable quotes (with attribution if available)

Be thorough — capture enough detail that a beginner could learn the full substance
without reading the original.

If the source itself uses an explicit structure — a numbered list ("10 tips"), a
named multi-part comparison, a recurring motif it returns to more than once — treat
that structure as content in its own right. Make sure every named part of it shows
up somewhere in the output, even if you merge several into one themed block. A
checklist above tells you what kinds of content to look for; it is not a ceiling —
something the source clearly organized itself around does not stop mattering just
because it doesn't fit one of those categories.

# Page composition guidance
Let the article's structure drive the page structure. Ask: what is the most interesting
or surprising thing about this content, and how can the layout make that clear at a glance?

- A narrative article may work best as flowing sections with quote blocks and a single strong takeaway
- A listicle or framework article maps naturally onto numbered steps or a card grid.
- A data-heavy article benefits from a stat row up front.
- A cautionary or critical piece might open with a caution list before the hero.

Mix, repeat, and reorder blocks to serve the story — but don't let the blocks
*replace* the story. Where two points are causally or thematically linked, say so
in a sentence (a Prose block, a Card's text, a section intro) rather than placing
them side by side and letting the reader infer the connection. A page of accurate,
disconnected facts is a worse summary than one that shows how the facts relate.
`,
  },
  {
    goal: "understand",
    label: "Understand",
    description:
      "A beginner-friendly explanation, assuming no prior knowledge.",
    promptTemplate: `
Explain the following content to someone with no prior background in the subject. Assume
intelligence, not familiarity — they can follow a well-built argument, they just don't yet
have the vocabulary or context this content assumes.

- Build understanding from the ground up: establish the basic concept before layering on
  nuance or edge cases.
- Define every technical term in plain language the first time it's used, then keep using
  the real term — don't dumb down the vocabulary, just don't assume it.
- Use a concrete analogy or everyday comparison wherever it would clarify an abstract idea,
  but don't force one where the content is already simple.
- Anticipate the confusion a newcomer would actually hit (a term that sounds like something
  else, a step that seems to skip logic) and address it directly.
`,
  },
];

// ---------------------------------------------------------------------------
// Source modes — how a multi-source bundle's sources relate to each other
// ---------------------------------------------------------------------------

/**
 * A digest goal says how *deep* and in what *voice* to write. It says nothing
 * about how multiple sources relate, and that's a separate axis: two articles
 * by one author on one subject want merging, two product reviews want a table,
 * three yearly retrospectives want a timeline. Asserting one of those for all
 * bundles produces category errors — a "compare and contrast" of two
 * complementary articles reads as a contest that isn't there.
 *
 * The mode template is appended to the goal template to form the system
 * prompt. It owns page composition for multi-source digests, which is why it
 * gets the last word over the (singular-voiced) goal guidance above.
 */
export interface SourceModeConfig {
  mode: string;
  label: string;
  description: string;
  promptTemplate: string;
}

export const DEFAULT_SOURCE_MODE = "synthesize";

export const SOURCE_MODES: SourceModeConfig[] = [
  {
    mode: "synthesize",
    label: "Synthesize",
    description:
      "Merge complementary sources on one subject into a single coherent digest.",
    promptTemplate: `
# Multiple sources: synthesize
You are working from several sources, not one. Where the guidance above refers to
"the article" or "the content", read it as "the material across all of the sources".

These sources are complementary — different pieces covering one subject, often by
the same author or from the same perspective. Treat them as one body of material:

- Merge overlapping content. If two sources make the same point, state it once, in
  the place it fits best. Repetition is the main failure mode here.
- Let the *subject* drive the page structure, never the source boundaries. Do not
  organize the page as "what source 1 said, then what source 2 said", and do not
  write a section per source.
- Do not attribute claims to individual sources by default. Attribution is noise
  when the sources agree or share an author. Attribute only where a specific claim
  genuinely belongs to one source and that matters to the reader.
- Do NOT use ComparisonTable or ProsCons to contrast the sources against each
  other — they are not competing options. (Either block is still fine for content
  *within* the material, e.g. a real trade-off the sources themselves discuss.)
- Where sources genuinely disagree, say so in prose or a Callout rather than
  building the whole page around the disagreement.
`,
  },
  {
    mode: "compare",
    label: "Compare",
    description:
      "Sources offer competing or differing takes — surface agreements and divergences.",
    promptTemplate: `
# Multiple sources: compare
You are working from several sources, not one. Where the guidance above refers to
"the article" or "the content", read it as "the material across all of the sources".

These sources present competing or differing takes on the same question. The
comparison *is* the point of the page:

- Open with what the sources agree on, then move to where they diverge and why.
- Use ComparisonTable for dimensions the sources genuinely address in common: one
  column per source, one row per criterion. Do not invent rows a source is silent
  on — leave that cell empty rather than guessing.
- Use AuthorCard to attribute contested or source-specific claims, so the reader
  can tell whose position is whose.
- Set winnerIndex only where the sources actually converge on a favourite. Omit it
  when the honest answer is "it depends".
- Don't manufacture disagreement. If the sources turn out to mostly agree, say so
  plainly and keep the comparison short.
`,
  },
  {
    mode: "evolution",
    label: "Evolution",
    description:
      "Sources sampled across time — show how the subject changed.",
    promptTemplate: `
# Multiple sources: evolution
You are working from several sources, not one. Where the guidance above refers to
"the article" or "the content", read it as "the material across all of the sources".

These sources are sampled across time and show how the subject developed:

- Use TimelineEvent as the page's spine, ordered by date, one entry per meaningful
  shift. Use its sourceIndex to link an entry back to the source it came from, and
  its narrative to state the overall trajectory.
- Emphasize what *changed* and why: a claim that was reversed, a tool that
  replaced another, a prediction that did or didn't land.
- Note what stayed constant too — the parts that didn't change are often the more
  interesting finding.
- Don't present superseded information as current. Where an earlier source is now
  wrong, say so explicitly rather than reporting both as equally true.
`,
  },
];

export function getSourceMode(mode: string): SourceModeConfig {
  const found = SOURCE_MODES.find((m) => m.mode === mode);
  if (!found) throw new Error(`Unknown source mode: ${mode}`);
  return found;
}

export function getDigestGoal(goal: string): DigestGoalConfig {
  const found = DIGEST_GOALS.find((g) => g.goal === goal);
  if (!found) throw new Error(`Unknown digest goal: ${goal}`);
  return found;
}

// ---------------------------------------------------------------------------
// Grounding rules — a third, non-optional axis
// ---------------------------------------------------------------------------

/**
 * Applies to every digest regardless of goal or source mode, and is composed
 * last so it has the final word over both.
 *
 * The failure this exists to prevent, observed in digest 80984bad: a YouTube
 * URL was ingested by scraping the watch page, which yielded nav chrome, view
 * counts and the recommendation sidebar rather than the talk. From the ~90-word
 * description the model learned only that the talk offered "a UX framework of 5
 * principles" — and it invented five, with confident titles, none of them from
 * the talk. It then built a StatCard row out of the view and like counts, and a
 * "Related talks" section out of the sidebar (which included a Linus Tech Tips
 * video about printers).
 *
 * Every one of those passed validation, because validation checks that props
 * fit their schema, not that the content came from the source. Nothing in the
 * prompt said the material might be inadequate, or that a page's furniture is
 * not its content. Both are now said explicitly.
 *
 * A YouTube transcript fetcher was tried and reverted (unreliable from
 * Lambda's IPs — see `plans/thin-source-detection.md`); videos now go through
 * manual paste instead, so this specific scrape shouldn't recur. But a
 * paywalled article, a JS-only page, or a cookie wall produces the same shape
 * of input, and the honest response to thin material is to report it, not to
 * fill the gap.
 */
export const GROUNDING_RULES = `
# Grounding (overrides everything above)
Every claim on the page must come from the source material. These rules outrank
any composition guidance above: it is better to emit a short, thin page than a
well-shaped page containing things the material does not say.

- Never infer content from a title, description, or heading. If the material
  announces something it does not then deliver — "a framework of 5 principles",
  "three key lessons" — report only what is actually present. Do not reconstruct
  the missing items from your own knowledge of the subject, however confident
  you are about what they probably were.
- Page furniture is not source material. View counts, like and subscriber
  counts, follower counts, reading-time estimates, share counts, navigation,
  "sign in" and cookie prompts, newsletter signups, comment sections, related
  or recommended links, and "up next" sidebars are all artifacts of the page
  the material was fetched from. Never build a StatCard, LinkItem list, or any
  other block out of them. A StatCard must carry a figure the material itself
  discusses; a LinkItem must be a link the material itself points the reader to.
- Error text is not content. If the material contains a fetch failure, an HTTP
  error, a paywall, a login wall, a bot check, or an "enable JavaScript"
  message, the fetch did not get the article. Say so plainly and stop; do not
  write around it.
- If the material is too thin to support the requested depth, say so in the
  page itself — a Callout stating what was retrieved and what is missing is the
  correct output. Do not pad it to look complete.
- Quote only text present in the material, and attribute only to the speaker or
  author the material names. Do not attach a timestamp to a quote unless the
  material carries one.
- Synthesis is not invention. A sentence that connects two of the source's own
  points — states the pattern they share, the cause behind both, the throughline
  the material itself is making — is still grounded, as long as both points are
  actually in the material. Invention is a fact, figure, example, or claim the
  source never made. Do not use this rule as a reason to leave connections
  unstated; state them, just don't manufacture the points being connected.
`;
