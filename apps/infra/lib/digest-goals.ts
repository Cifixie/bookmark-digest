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

# Page composition guidance
Let the article's structure drive the page structure. Ask: what is the most interesting
or surprising thing about this content, and how can the layout make that clear at a glance?

- A narrative article may work best as flowing sections with quote blocks and a single strong takeaway
- A listicle or framework article maps naturally onto numbered steps or a card grid.
- A data-heavy article benefits from a stat row up front.
- A cautionary or critical piece might open with a caution list before the hero.

Mix, repeat, and reorder blocks to serve the story.
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
