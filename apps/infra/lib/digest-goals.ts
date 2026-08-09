/**
 * Digest goals config — the single source of truth for what digests are
 * available, which catalog blocks each goal may author, and the goal's
 * prompt framing + modifier options.
 *
 * Imported by:
 *   - apps/infra/lambdas/digest-goals/handler.ts  (GET /digest-goals)
 *   - apps/infra/lambdas/generate-digest/handler.ts (prompt assembly)
 */

import type { DigestBlock } from "@bookmark-digest/catalog";

export interface DigestGoalModifier {
  key: string;
  label: string;
  description: string;
  options: string[];
  default?: string;
}

export interface DigestGoalConfig {
  goal: string;
  label: string;
  description: string;
  promptTemplate: string;
  allowedBlockTypes: DigestBlock["type"][];
  modifiers: DigestGoalModifier[];
}

export const DIGEST_GOALS: DigestGoalConfig[] = [
  {
    goal: "summary",
    label: "Summary",
    description: "A concise prose summary of the source content.",
    promptTemplate: "Provide a concise summary of the following content. Keep it under 200 words.",
    allowedBlockTypes: ["Prose"],
    modifiers: [],
  },
  {
    goal: "tl_dr",
    label: "TL;DR",
    description: "Ultra-short bullet-point summary.",
    promptTemplate: "Give a TL;DR — 3-5 bullet points capturing the core message.",
    allowedBlockTypes: ["TLDR", "List"],
    modifiers: [],
  },
  {
    goal: "notes",
    label: "Notes",
    description: "Structured notes from the content.",
    promptTemplate: "Extract structured notes from the following content.",
    allowedBlockTypes: ["List", "Card", "GlossaryTerm"],
    modifiers: [
      {
        key: "format",
        label: "Format",
        description: "Output format for notes",
        options: ["bullet", "paragraph", "markdown"],
        default: "bullet",
      },
      {
        key: "detail",
        label: "Detail level",
        description: "How much detail to include",
        options: ["brief", "comprehensive"],
        default: "comprehensive",
      },
    ],
  },
  {
    goal: "action_items",
    label: "Action Items",
    description: "Extracted next steps or action items.",
    promptTemplate: "Extract concrete action items or next steps from the following content.",
    allowedBlockTypes: ["NextSteps", "ChecklistItem"],
    modifiers: [],
  },
  {
    goal: "key_points",
    label: "Key Points",
    description: "The most important standalone points.",
    promptTemplate: "List the key points from the following content.",
    allowedBlockTypes: ["List", "StatCard", "Callout"],
    modifiers: [],
  },
];

export function getDigestGoal(goal: string): DigestGoalConfig {
  const found = DIGEST_GOALS.find((g) => g.goal === goal);
  if (!found) throw new Error(`Unknown digest goal: ${goal}`);
  return found;
}
