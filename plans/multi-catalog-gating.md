# Per-intention catalogs (multi-catalog gating)

**Status:** deferred — deliberately not built. `Chart`/`PullQuote`/
`ComparisonNarrative` (the blocks this exists to potentially gate) have all
shipped (Milestone 1, `plans/ROADMAP.md`). Not queued — kept as its own file
because it has an explicit trigger below, not a scheduled slot. See
`plans/PARKED.md` for ideas parked without a trigger.

**Goal:** stop offering the model blocks that don't fit the current
`digestGoal`/`sourceMode` (e.g. `Chart` for `tl_dr`, `PullQuote` for
`compare`/`evolution` where attribution matters more) by constructing
multiple `defineCatalog()` catalogs — one per intention or intention group —
instead of prompt-text disambiguation on a single global catalog, and instead
of a custom allowlist/filter layered on top of one catalog.

## Why this exists

`plans/archive/phase-2b-catalog-expansion.md` added `Chart` and `PullQuote`,
both of which overlap an existing block closely enough that the model could
reach for the wrong one (`Chart` vs `StatCard`/`ComparisonTable`;
`PullQuote` vs `QuoteBlock`). That plan handles it with prompt text only —
the same pattern already used for `synthesize` mode's "Do NOT use
ComparisonTable or ProsCons" guidance — and deliberately does not build any
gating mechanism, matching `plans/archive/phase-3-browse-search.md`'s
earlier decision to defer `allowedBlockTypes` as speculative. See
[[decisions]] for the durable version of this reasoning.

An earlier version of this idea proposed a single global catalog plus a
runtime `allowedBlockTypes?: string[]` field on `DigestGoalConfig`/
`SourceModeConfig`, intersected by a `resolveAllowedBlocks()` helper, with
`catalog.prompt()` wrapped or post-filtered to honor it. That's a
reasonable-sounding design but it's fighting the library: `@json-render/core`
0.19.0's `defineCatalog(schema, catalog)` takes its block set at construction
time and `prompt()`'s `PromptOptions` has no subset/filter parameter at all
(checked directly against
`node_modules/.pnpm/@json-render+core@0.19.0/.../dist/index.d.ts`). Building
a filter on top means maintaining a second list (which blocks are allowed)
that has to stay in sync with the first (which blocks exist), plus either a
prompt-text post-filter hack or convincing an external package to accept a
param it doesn't have.

**Better fit:** build N catalogs directly with `defineCatalog()`, each
constructed from a subset of the same per-block schema modules. This uses
the library's actual primitive for "which blocks does this prompt know
about" instead of reimplementing it.

## Design sketch

- Each block keeps exactly one definition: `packages/catalog/src/digestBlocks/<Name>.catalog.ts`,
  registered once in `digestBlockProps.ts`. No block definition is duplicated
  per catalog — catalogs differ only in which modules they import.
- `packages/catalog/src/digestBlocks/catalog.ts` currently does one
  `defineCatalog()` call with every block. This becomes a small set of named
  exports, e.g. `catalogFor(goal, mode)` or explicit named catalogs
  (`tlDrCatalog`, `synthesizeCatalog`, ... — naming depends on how many
  distinct block sets actually turn out to be needed once you look at real
  overlap, which may be far fewer than the full cross product of 3 goals ×
  3 modes).
- `registry.tsx`'s throw-on-missing-renderer guard stays exactly as-is,
  walking the single flat `digestBlockProps` map — it doesn't care how many
  prompt-catalogs exist on top, since every block still needs a renderer
  regardless of which catalogs include it. **Don't let this guard start
  reading from a catalog object instead of `digestBlockProps`** — that's the
  one invariant worth protecting from the multi-catalog refactor.
- `generate-digest/handler.ts` picks which catalog to call `.prompt()` on
  based on the resolved `digestGoal`/`sourceMode`, instead of always calling
  the single global catalog.
- `validateDigestSpec` needs the matching catalog (or its block-name set)
  passed in, so a block outside that catalog's set is flagged the same way
  an unknown block type already is today — this was true under the old
  allowlist design too and doesn't change here.

## Open questions to resolve when this is picked up

- How many distinct catalogs are actually needed? Don't build 9 (3 goals ×
  3 modes) if most combinations share the same block set — group by actual
  observed overlap, not by the cross product.
- Where do the per-catalog block-set decisions live — inline in
  `digest-goals.ts` next to the prompt templates they pair with, or in the
  new `catalog.ts` alongside the `defineCatalog()` calls? Whichever keeps the
  "why is this block excluded here" reasoning next to the prompt text that
  currently carries it.
- Multi-axis composition: `sourceMode` only applies to multi-source digests.
  Confirm whether a mode-specific catalog needs to further intersect with a
  goal-specific catalog, or whether mode fully determines the set when
  present (mode's template already overrides goal's per
  `digest-goals.ts`'s stated precedence).

## Trigger to build this

Same evidence bar as the allowlist idea it replaces: generate real digests
across goals/modes with `Chart`/`PullQuote` live under phase-2b's prompt-text-only
approach, and revisit here if the model actually reaches for the wrong block
in practice. Don't build speculatively.

## Key files (once started)

- `packages/catalog/src/digestBlocks/catalog.ts` — becomes multiple
  `defineCatalog()` calls instead of one
- `packages/catalog/src/digestBlockProps.ts` — unchanged, stays the single
  source of truth for "which blocks exist"
- `apps/web/src/lib/registry.tsx` — unchanged; guard keeps reading
  `digestBlockProps`
- `apps/infra/lib/digest-goals.ts` — goal/mode config, likely where
  per-catalog block-set choices are documented next to the prompt templates
- `apps/infra/lambdas/generate-digest/handler.ts` — selects which catalog to
  prompt with, passes matching set into `validateDigestSpec`
- `packages/catalog/src/validateDigestSpec.ts` — needs the resolved
  catalog's block set to flag out-of-scope blocks
