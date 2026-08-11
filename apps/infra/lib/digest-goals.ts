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
    goal: "summary",
    label: "Summary",
    description: "A thorough prose summary of the source content.",
    promptTemplate:
      "Provide a thorough summary of the following content, covering all its major points. " +
      "Use multiple sections and a mix of block types to reflect the structure of the source " +
      "rather than compressing everything into a single block.",
  },
  {
    goal: "tl_dr",
    label: "TL;DR",
    description: "Ultra-short bullet-point summary.",
    promptTemplate: "Give a TL;DR — 3-5 bullet points capturing the core message.",
  },
  {
    goal: "notes",
    label: "Notes",
    description: "Structured notes from the content.",
    promptTemplate: "Extract structured notes from the following content.",
  },
  {
    goal: "action_items",
    label: "Action Items",
    description: "Extracted next steps or action items.",
    promptTemplate:
      "Extract concrete action items or next steps from the following content. " +
      "Group related items and add brief context for each so the reasoning behind it is clear.",
  },
  {
    goal: "key_points",
    label: "Key Points",
    description: "The most important standalone points.",
    promptTemplate:
      "List the key points from the following content, organized by theme. " +
      "Give each point enough detail to stand on its own, and call out examples or caveats where the source gives them.",
  },
  {
    goal: "understand",
    label: "Understand",
    description: "A beginner-friendly explanation, assuming no prior knowledge.",
    promptTemplate:
      "Explain the following content like you would to a child who has no previous knowledge of any of this. " +
      "Avoid jargon; when a technical term is unavoidable, define it in plain language before using it. " +
      "Use simple analogies and short sentences to build understanding from the ground up.",
  },
];

export function getDigestGoal(goal: string): DigestGoalConfig {
  const found = DIGEST_GOALS.find((g) => g.goal === goal);
  if (!found) throw new Error(`Unknown digest goal: ${goal}`);
  return found;
}
