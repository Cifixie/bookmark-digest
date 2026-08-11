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

export function getDigestGoal(goal: string): DigestGoalConfig {
  const found = DIGEST_GOALS.find((g) => g.goal === goal);
  if (!found) throw new Error(`Unknown digest goal: ${goal}`);
  return found;
}
