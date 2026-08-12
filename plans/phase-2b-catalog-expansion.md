# Phase 2b: Catalog expansion — new blocks + per-intention gating

**Context:** sits between phase-2 (`plans/phase-2-handoff.md`, complete) and
phase-3 (`plans/phase-3-browse-search.md`, not started). Digests render
correctly today but look visually flat — 22 blocks exist, but nothing renders
data visually (charts) and nothing gives dense prose a visual break
(pull-quotes). This phase adds a small set of new blocks and, because two of
them are easy for the model to reach for outside their intended context,
builds the per-intention block allowlist that `phase-3-browse-search.md`
explicitly deferred as speculative — it's no longer speculative once a
concrete block needs it.

**Not a blocker for phase-3.** Browse/search operates on `DigestMeta` and
list endpoints, independent of which blocks a digest contains. Sequence
either order; this plan assumes it goes first per the discussion that
produced it, but nothing here touches `sourcesScan`, `title`, or `subject`/
`tags`.

## Step 1: Two new blocks

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
  number) or `ComparisonTable` (qualitative rows) actually fit better. This
  is the concrete case that motivates Step 2.

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

## Step 2: Per-intention block allowlist

Today every `digestGoal`/`sourceMode` sees the entire catalog via
`catalog.prompt()`, and disambiguation is prompt-text-only (e.g. the
`synthesize` mode template already has to explicitly say "Do NOT use
ComparisonTable or ProsCons" — this pattern will only grow as blocks are
added). `phase-3-browse-search.md` deliberately deferred building
`allowedBlockTypes` as speculative; `Chart`/`PullQuote` make it concrete:
`Chart` should probably not be offered for `tl_dr` (too terse to need it),
and `PullQuote` overlapping with `QuoteBlock` is exactly the kind of
confusion allowlisting removes at the source instead of managing in prose.

**Design:** one global `defineCatalog` registration stays as-is (so
`registry.tsx`'s throw-on-missing-renderer invariant keeps covering every
block regardless of intention — don't fork the catalog itself). Add a
block-list resolution layered on top:

1. Add `allowedBlockTypes?: string[]` to `DigestGoalConfig` and
   `SourceModeConfig` in `apps/infra/lib/digest-goals.ts`. Omitted = no
   restriction beyond whatever the other axis says (avoids having to
   enumerate a full list for every goal on day one).
2. Add a `resolveAllowedBlocks(goal, mode)` helper (same file) that
   intersects the two lists when both are present, else falls back to "all
   registered blocks" from `digestBlockProps`.
3. `generate-digest/handler.ts` passes the resolved list into whatever
   builds the prompt — needs `catalog.prompt()` (or a wrapper around it) to
   accept a block subset. Check `@json-render/core`'s `defineCatalog`/
   `prompt()` signature for an existing filter param before adding one;
   it's an external package (`node_modules/.pnpm/@json-render+core@0.19.0`)
   so if it can't filter, the wrapper needs to post-filter the generated
   prompt text's block-list section, not the schema.
4. **Validation must use the same resolved list**, or a block that's
   off-limits for that intention still passes `validateDigestSpec` — silently
   reintroducing the exact confusion the allowlist exists to prevent. Thread
   `allowedBlockTypes` into `validateDigestSpec(spec, allowedBlockTypes?)` and
   have it flag a block outside the list as an issue, same shape as existing
   per-type prop errors.
5. Seed data: `Chart` excluded from `tl_dr`; `PullQuote` excluded from
   `compare`/`evolution` modes (attribution matters more there, per those
   modes' existing prompt templates) but included in `summary`/`understand`.
   Everything else stays universally allowed — don't retroactively restrict
   working blocks without a concrete misuse case, matching the "cheap to add
   later" reasoning that deferred this in the first place.

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

1. `Chart` + `PullQuote`: schema, renderer, registry — no gating yet, ship
   with prompt-text disambiguation only (same pattern as existing blocks) to
   validate the block designs themselves before adding infrastructure.
2. Generate a few real digests across goals/modes, check whether prompt-text
   alone keeps the model from misusing either block. If it holds, allowlisting
   is nice-to-have, not urgent — reassess before building Step 2.
3. If misuse shows up (or preemptively, once confident in the two blocks):
   build the allowlist mechanism (Step 2, items 1-4), wire the seed data
   (item 5).

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
- `apps/infra/lib/digest-goals.ts` — goal/mode config + (new) allowlist
  resolution
- `apps/infra/lambdas/generate-digest/handler.ts` — prompt building, calls
  `validateDigestSpec`
- `packages/catalog/src/validateDigestSpec.ts` — per-type props validation,
  needs the allowlist check added
