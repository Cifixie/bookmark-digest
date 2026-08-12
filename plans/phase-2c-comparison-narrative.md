# Phase 2c: `ComparisonNarrative` — extended cross-source comparisons

**Context:** sits after phase-2b (`plans/phase-2b-catalog-expansion.md`) — reuses
its exact pattern (schema + renderer + registration, ship without gating
first, phase-2b's not-yet-built per-intention allowlist as the eventual home
for this block's seed data). Motivated by a concrete finding from reviewing
two real digests of the "After the AI Hype" NDC talk against a hand-authored
HTML summary of the same source: the source spends ~600 words on "Are We
Netscape or Google?" — four short entity profiles (Netscape, Google, OpenAI
vs Anthropic, the infrastructure legacy) tied together by one connecting
question ("which of today's AI companies survives the bust?"). Neither the
`summary` nor `understand` digest included any of it. Not a grounding
failure — a shape failure. Nothing in the catalog has a slot for "profile N
named things, then say what connects them."

## Problem: no block fits an entity-first, throughline-connected comparison

- `ComparisonTable` is criteria-first: columns are sources/items, rows are
  shared dimensions, cells are values. Good when sources genuinely address
  the same explicit questions. Forcing an entity-first comparison into it
  either invents criteria neither source addresses (which `GROUNDING_RULES`
  already forbids) or produces a table so sparse it isn't worth rendering.
- `ProsCons` is binary and single-subject — not built for 2+ named things.
- `TimelineEvent` is a single chronological spine. The Netscape/Google case
  mixes a historical analog with a present-day open question — it isn't
  "what changed over time," it's "which of these does the current thing
  resemble," which isn't ordered by date at all.
- Same shape of gap applies directly to `compare` sourceMode, not just this
  one single-source case: sources being compared are often not reducible to
  shared criteria — two competing narratives, two histories, two design
  philosophies — and today's toolkit only has the criteria-grid shape for
  that situation.

## Design: container-only, no new item block

The gap isn't "we lack a profile card" — `Card` (title/subtitle/text) and
`AuthorCard` (name/text/url/context, already the block `compare` mode uses
for per-source attribution) both already have exactly the shape an entity
profile needs. The gap is a container that *requires* the model to state
what connects the entities, instead of letting `Grid` arrange same-shaped
cards with no semantic relationship between them at all.

### `ComparisonNarrative`

- Props sketch: `title: string`, `subtitle?: string`, `throughline: string`
  — **required, not optional**. States the shared question, the pattern, or
  the archetype being drawn between the entities. This is the schema-level
  version of the "state the connection, don't rely on adjacency" fix already
  made in prose (`GROUNDING_RULES`'s synthesis clarification, `Prose`'s
  reworded description) — here a missing or empty throughline is a
  validation failure, not a hopeful prompt suggestion.
- Children: `Card` or `AuthorCard` elements, one per entity — `AuthorCard`
  when an entity is a specific source (carries attribution), `Card` when
  it's a named thing the source discusses but isn't itself one of the
  digest's sources (a historical analog, a competing product, an era).
- Renderer sketch: title/subtitle header, `throughline` rendered with
  visual weight up front (Callout-adjacent, not a buried caption), child
  cards in a row/grid beneath. Closest existing precedent is the
  hand-authored HTML's `examples-row` pattern from the source review.

For registration: same four touch-points as phase-2b's `Chart`/`PullQuote` —
`packages/catalog/src/digestBlocks/ComparisonNarrative.catalog.ts` (props +
description), `packages/catalog/src/digestBlockProps.ts`,
`packages/catalog/src/digestBlocks/catalog.ts`, a renderer under
`apps/web/src/components/digestBlocks/ComparisonNarrative/`, registered in
`apps/web/src/lib/registry.tsx`'s `blockComponents` (its throw-on-missing
guard catches a forgotten renderer immediately — run
`pnpm --filter web typecheck` before calling this done).

## Disambiguation risk (same format as phase-2b's Chart/PullQuote)

- **vs `ComparisonTable`**: use `ComparisonTable` when the source evaluates
  entities against the *same explicit criteria* — a real grid. Use
  `ComparisonNarrative` when entities are compared by role, trajectory, or
  analogy rather than shared dimensions. Prompt guidance must say this
  explicitly, the same way `synthesize` mode's template already explicitly
  bans `ComparisonTable`/`ProsCons` for cross-source contrast (see below).
- **vs `Grid` (+ Card/AuthorCard children)**: `Grid` has no semantic
  requirement that its children relate to each other at all. The mandatory
  `throughline` is the differentiator — if the model can't state a real one,
  that's the signal the content belongs in `Grid`, not that `throughline`
  should be filled with a generic placeholder sentence to pass validation.
- **vs `TimelineEvent`**: `TimelineEvent` is one chronological spine ("how X
  changed"). `ComparisonNarrative` is parallel entities, not necessarily
  ordered by date (the Netscape/Google/OpenAI/Anthropic case mixes eras).
  `evolution` mode keeps `TimelineEvent` as its default; `ComparisonNarrative`
  supplements it only when entities are juxtaposed rather than sequenced.
- **vs `ProsCons`**: `ProsCons` is one subject's binary tradeoff list, not
  2+ individually-named, individually-profiled entities.
- **vs a lone `AuthorCard`**: today's `compare`-mode pattern uses `AuthorCard`
  inline to attribute a single claim within prose. `ComparisonNarrative`
  is for when several such profiles together *are* the comparison the page
  is making, not an inline attribution aside.

## `digest-goals.ts` prompt touch-points

- `compare` template: add `ComparisonNarrative` as the alternative to reach
  for when sources "genuinely disagree" in a way that isn't reducible to
  shared criteria — sits alongside the existing `ComparisonTable`/
  `AuthorCard`/`winnerIndex` guidance.
- `synthesize` template: extend the existing line — *"Do NOT use
  ComparisonTable or ProsCons to contrast the sources against each
  other"* — to include `ComparisonNarrative`. Same carve-out, same
  reasoning (merging sources, not contesting them). Skipping this is the
  concrete way the new block becomes a loophole around synthesize's own
  rule.
- `evolution` template: note `TimelineEvent` stays the default spine;
  `ComparisonNarrative` may supplement it for a genuinely parallel (non-
  chronological) contrast, not replace the timeline.
- Single-source `summary`/`understand` goal templates: no further change
  needed — the motif-coverage line added in the last prompt pass ("if the
  source itself uses ... a recurring motif it returns to") already tells
  the model to preserve this kind of content. `ComparisonNarrative` is
  simply where that content now has somewhere to go.

## Per-intention gating (once phase-2b Step 2 lands)

Seed data to add alongside phase-2b's `Chart`/`PullQuote` entries: exclude
`ComparisonNarrative` from `tl_dr` (too terse for multi-entity profiles) and
from `synthesize` (matches the `ComparisonTable`/`ProsCons` carve-out
above); leave it allowed everywhere else. Until Step 2 exists, ship with
prompt-text disambiguation only — same "validate the design before building
infrastructure for it" sequencing phase-2b used for `Chart`/`PullQuote`.

## Small cleanup noticed in passing

`Grid.catalog.ts`'s description still reads "Card, StatCard, or Pillar
children" — `Pillar` isn't a registered block (not in the 22, not in
`digestBlockProps`), presumably a dead reference from before a rename.
Worth a one-line fix while touching this file family; not blocking this
plan.

## Sequencing

1. `ComparisonNarrative`: schema, renderer, registration — no gating yet,
   prompt-text disambiguation only, to validate the block design itself
   first (same reasoning as phase-2b's own Step 1/Step 2 split).
2. Update `compare`/`synthesize`/`evolution` templates in `digest-goals.ts`
   per above.
3. Regenerate the two "After the AI Hype" digests (`summary` + `understand`)
   plus a real `compare`-mode multi-source digest. Confirm: (a) the
   Netscape/Google material now surfaces in a `ComparisonNarrative`, (b)
   `synthesize`-mode digests don't reach for it inappropriately, (c)
   `throughline` never comes back empty or generic ("these are both
   interesting" is a validation-passing but useless throughline — watch for
   it manually since schema can only check presence, not quality).
4. If misuse shows up (reached for as a generic `Grid` substitute, or
   preferred over `ComparisonTable` when criteria really were shared),
   that's the trigger to prioritize phase-2b Step 2 for this block
   specifically — same reassessment rule phase-2b already states.

## Verify

```bash
pnpm --filter catalog test
pnpm --filter catalog typecheck
pnpm --filter web typecheck       # catches a missing renderer immediately
pnpm --filter infra typecheck
```

No CDK/table changes — `cdk diff` should show no resource changes.

## Key files

- `packages/catalog/src/digestBlocks/ComparisonNarrative.catalog.ts` (new)
- `packages/catalog/src/digestBlockProps.ts`,
  `packages/catalog/src/digestBlocks/catalog.ts` — registration
- `apps/web/src/lib/registry.tsx` — renderer map + exhaustiveness guard
- `apps/web/src/components/digestBlocks/ComparisonNarrative/` — renderer
- `apps/infra/lib/digest-goals.ts` — `compare`/`synthesize`/`evolution`
  template edits, (later) allowlist seed data
- `packages/catalog/src/digestBlocks/Grid.catalog.ts` — stray `Pillar`
  reference cleanup
