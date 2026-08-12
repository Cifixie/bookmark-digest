# Phase 2b: Catalog expansion — new blocks

**Context:** sits between phase-2 (`plans/phase-2-handoff.md`, complete) and
phase-3 (`plans/phase-3-browse-search.md`, not started). Digests render
correctly today but look visually flat — 22 blocks exist, but nothing renders
data visually (charts) and nothing gives dense prose a visual break
(pull-quotes). This phase adds a small set of new blocks. Disambiguation
against overlapping existing blocks is handled via prompt text only, same
pattern as the rest of the catalog — no per-intention gating mechanism is
being built. `phase-3-browse-search.md`'s decision to defer `allowedBlockTypes`
as speculative stands; nothing here reopens it.

**Not a blocker for phase-3.** Browse/search operates on `DigestMeta` and
list endpoints, independent of which blocks a digest contains. Sequence
either order; this plan assumes it goes first per the discussion that
produced it, but nothing here touches `sourcesScan`, `title`, or `subject`/
`tags`.

## New blocks

Pick these two first — they fill the two concrete gaps identified (no data
visualization, no visual rhythm break in text) without overlapping any
existing block:

### `Chart`
Bar chart or sparkline for quantitative content (trends, rankings,
distributions) — currently `StatCard` is single-value only and
`ComparisonTable` is prose-in-cells, neither renders a number visually.

- Props sketch: `variant: "bar" | "sparkline"`, `data: { label: string;
  value: number }[]`, `unit?: string`, `caption?: string`.
- Renderer: plain inline SVG or CSS-bar divs — no charting library. Data
  volume is small (model-authored, single digest), and a dependency isn't
  worth it for bars/sparklines. Revisit only if a variant needs real axes.
- Disambiguation risk: model could reach for `Chart` where `StatCard` (one
  number) or `ComparisonTable` (qualitative rows) actually fit better. Handle
  with prompt-text guidance, same pattern as existing overlapping blocks.

### `PullQuote`
Large-type single-sentence emphasis, unattributed — distinct from
`QuoteBlock`, which is always source-attributed (and carries
`timestampSeconds` from the `TranscriptQuote` merge). For breaking up long
`Prose` runs in `summary`/`understand` digests.

- Props sketch: `text: string`.
- Renderer: large font-size, no border/box — visually distinct from
  `Callout` (which already has a border+background pattern) and `QuoteBlock`
  (which implies attribution).
- Disambiguation risk: model could reach for `PullQuote` when it actually has
  a real quote to attribute (should be `QuoteBlock`). Prompt guidance must
  say "no attribution available" explicitly.

For each: add `packages/catalog/src/digestBlocks/<Name>.catalog.ts` (props +
description, same shape as `ComparisonTable.catalog.ts`), register in
`packages/catalog/src/digestBlockProps.ts` and
`packages/catalog/src/digestBlocks/catalog.ts`, add a renderer under
`apps/web/src/components/digestBlocks/<Name>/`, register in
`apps/web/src/lib/registry.tsx`'s `blockComponents` (the throw-on-missing
guard in that file catches a forgotten renderer immediately — don't skip
running `pnpm --filter web typecheck` before considering a block done).

Disambiguation against overlapping blocks (`Chart` vs `StatCard`/
`ComparisonTable`, `PullQuote` vs `QuoteBlock`) is handled entirely in prompt
text, same pattern as the existing `synthesize` mode template's "Do NOT use
ComparisonTable or ProsCons" guidance. No block-list/gating mechanism is
being introduced — `phase-3-browse-search.md`'s deferral of
`allowedBlockTypes` as speculative stands as-is.

## Deferred follow-up: `ComparisonTable.winnerIndex` should be nullable

Not part of this phase's scope, but same schema file family — worth doing in
the same pass as `Chart`/`PullQuote` since all three touch
`digestBlockProps`/`registry.tsx` review.

**Background:** the model sometimes emits explicit `null` for an omitted
optional field (e.g. `winnerIndex` on a `ComparisonTable` row/props) instead
of leaving the key out, which fails Zod's `.optional()` (accepts
`number | undefined`, not `null`). A generic workaround already shipped: a
`stripNulls()` helper in `generate-digest/handler.ts` recursively deletes
`null` values from every element's `props` before validation, fixing this for
all 22 block types, not just `ComparisonTable`.

**Follow-up still open:** make `winnerIndex` itself `.nullable().optional()`
in `packages/catalog/src/digestBlocks/ComparisonTable.catalog.ts` (both the
row-level and props-level fields) so the schema reflects reality directly
rather than relying solely on the handler-level strip, and update
`apps/web/src/components/digestBlocks/ComparisonTable/ComparisonTable.tsx`'s
two `=== winnerIndex` / `=== row.winnerIndex` comparisons to treat `null` the
same as `undefined` (they already do, since `null !== <number>`, but the
type change means `winnerIndex`'s inferred type becomes
`number | null | undefined` — worth an explicit `!= null` check for clarity
over relying on the coincidence). Low priority: `stripNulls` already makes
this a non-issue in practice; this is about the schema being honest, not
fixing a live bug.

## Sequencing

1. `Chart` + `PullQuote`: schema, renderer, registry, prompt-text
   disambiguation (same pattern as existing blocks).
2. Generate a few real digests across goals/modes and confirm prompt-text
   alone keeps the model from misusing either block.

## Verify

```bash
pnpm --filter catalog test
pnpm --filter catalog typecheck
pnpm --filter web typecheck       # catches a missing renderer immediately
pnpm --filter infra typecheck
```

No CDK/table changes in this phase — `cdk diff` should show no resource
changes at all; if it does, something unrelated leaked in.

## Key files

- `packages/catalog/src/digestBlocks/*.catalog.ts` — per-block schema +
  description (new: `Chart.catalog.ts`, `PullQuote.catalog.ts`)
- `packages/catalog/src/digestBlockProps.ts`,
  `packages/catalog/src/digestBlocks/catalog.ts` — registration
- `apps/web/src/lib/registry.tsx` — renderer map + exhaustiveness guard
- `apps/web/src/components/digestBlocks/<Name>/` — renderers
- `apps/infra/lib/digest-goals.ts` — goal/mode prompt templates
  (disambiguation text for `Chart`/`PullQuote` goes here)
- `apps/infra/lambdas/generate-digest/handler.ts` — prompt building, calls
  `validateDigestSpec`
- `packages/catalog/src/validateDigestSpec.ts` — per-type props validation
