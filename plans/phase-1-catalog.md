# Part A — Digest Catalog: two-axis schema + renderers (aws-archive)

## Context

`aws-archive` (`@bookmark-digest/*` pnpm monorepo) is a Phase-0 skeleton. `packages/catalog/src/index.ts` is an empty placeholder reserved for the Tier 1/Tier 2 `defineCatalog` schemas. The `ai-archive/components` tree is a **draft reference** for the component shapes, but its flat 36-component list, `Summary*` naming, and co-located React `.tsx` files don't match either the finalized 27-component catalog or aws-archive's production constraints.

This work builds the production catalog: a **two-axis model** — a `source-variant` discriminated union (how the digest was sourced) and a `digest-block` union (the content that fills sections) — composed into a typed `DigestPage` tree, plus raw React renderers in the web app. It replaces `Summary*` with `Digest*`, folds merged components (MythVsReality→Callout, TranscriptQuote→QuoteBlock, VideoHero/Chapter/Speaker→temporal source variant), and defers Tier 3.

### Confirmed decisions
- **Layout**: folder-per-component + barrels (ai-archive style), not the flat 3-file split.
- **Schema**: stock `@json-render/react/schema` (verified React-free at the `/schema` subpath — safe in a Lambda-imported package). Register **only LLM-authored content blocks**. No custom `defineSchema`, no `authoredBy` field.
- **Non-LLM sections** (`RelatedFromYourBookmarks`, `MyNote`): **not** in the catalog. Standalone schemas + their own resolver/workflow, embedded into the page separately.
- **Scope**: schemas **and** React renderers. Renderers live in `apps/web/src/components` (only consumer today). Design is intentionally raw.
- **Styling**: CSS Modules (native in Next 16, no new dependency).
- **Enums**: co-located in `packages/catalog/src/enums.ts` (catalog-domain; `@bookmark-digest/schemas` stays ingestion-only, `shared` stays reserved for AWS/AI utils).

### Key constraint
`packages/catalog` must stay **React-free** (imported by both the web app and validation Lambdas). Renderers therefore live in the web app, never in the catalog package.

---

## Axis breakdown (27 components)

**Source variants** — plain Zod union, NOT catalog components (they branch `DigestHero` + nested fields):
- `written`: author, publication, publishDate, readingTimeMinutes, difficulty, healthStatus
- `temporal`: title, showName, duration, mediaUrl, hasVideo, sourceLink, optional `chapters: Chapter[]`, optional `speakers: Speaker[]`
- Nested (temporal only): `Chapter` (timestamp, title, description?), `Speaker` (name, role?)
- Discriminant: `kind: "written" | "temporal"`. **Add a code comment** that `hasVideo` deliberately replaces a separate video/podcast sub-type — do not re-split.

**Page shell** — plain Zod schemas, NOT in `defineCatalog`:
- `DigestPage` = `{ source: SourceVariant, meta: DigestMeta, sections: DigestSection[], accentColor?: string }`
- `DigestSection` = `{ heading, subtitle?, anchorId, content: DigestBlock[] }`
- `DigestHero`, `SourceMeta` (+ `healthStatus`), `DigestMeta` (digestType, tone, length, date), `DigestFooter`

**Content blocks (19)** — registered in `defineCatalog`, the `DigestBlock` union:
`TLDR, Prose, List, Grid, Callout, Card, StatCard, FaqItem, GlossaryTerm, Figure, QuoteBlock, CodeBlock, Terminal, ChecklistItem, NextSteps, Prerequisites, LinkItem, ProsCons, Step`
- `Callout.variant` includes `misconception` (absorbs MythVsReality); enum: info/tip/warning/success/note/analogy/big-idea/takeaway/why-it-matters/misconception
- `QuoteBlock` gains optional `timestampSeconds` (absorbs TranscriptQuote; only meaningful when source is temporal)

**Non-catalog sections (2)** — standalone schemas, separate resolvers, embedded into the page:
`RelatedFromYourBookmarks` (pgvector retrieval), `MyNote` (user-authored)

**Deferred (Tier 3, out of scope):** ComparisonTable/Versus, TimelineEvent, DecisionItem, AuthorCard.

---

## `packages/catalog/src/` structure

```
enums.ts                     tone, length, difficulty, sourceHealthStatus (ok/moved/paywalled/404), digestType
sourceVariants/
  Written/Written.schema.ts        Chapter/Speaker/Temporal/Written zod + inferred types
  Temporal/Temporal.schema.ts
  index.ts                         sourceVariantSchema = discriminatedUnion("kind", [...]) + types
digestBlocks/
  Callout/Callout.catalog.ts       export const props (zod) + description  ← ai-archive .catalog.ts shape
  TLDR/TLDR.catalog.ts
  ... (19 content-block folders)
  catalog.ts                       barrel: export * as Callout from "./Callout/Callout.catalog"; ...
page/
  DigestHero/DigestHero.schema.ts  page-shell zod schemas (NOT in defineCatalog)
  SourceMeta/... DigestMeta/... DigestFooter/... DigestSection/...
  index.ts
nonCatalog/
  RelatedFromYourBookmarks.schema.ts, MyNote.schema.ts   standalone, not LLM-authored
catalog.ts                   defineCatalog(schema, { components: {...digestBlocks}, actions: {} })
index.ts                     DigestPage type tree + DigestBlock union + re-exports everything
```

- Each content block's `.catalog.ts` mirrors ai-archive exactly: `import z from "zod"; export const props = z.object({...}); export type XProps = z.infer<typeof props>; export const description = "..."`.
- `catalog.ts` composition (mirrors ai-archive `lib/catalog.ts`):
  ```ts
  import { defineCatalog } from "@json-render/core";
  import { schema } from "@json-render/react/schema";
  import * as components from "./digestBlocks/catalog";
  export default defineCatalog(schema, { components, actions: {} });
  ```
- `index.ts` builds the typed `DigestBlock` union from the block prop schemas — `z.discriminatedUnion("type", [ z.object({ type: z.literal("Callout"), props: CalloutProps }), ... ])` — so `DigestSection.content: DigestBlock[]` is both strongly typed and shaped like a json-render element (minus children). Derive it from the barrel to avoid drift.
- **Add deps** to `packages/catalog/package.json`: `@json-render/core`, `@json-render/react` (peer `react` unmet is fine — `.npmrc` has `strict-peer-dependencies=false`; only the React-free `/schema` subpath is imported).

### Files to reference / reuse
- `ai-archive/components/*/*.catalog.ts` — port the Zod `props` + `description` per block, adjusting to the finalized names/fields. **Check ai-archive's `List` and `Grid` catalog files** to decide item-containment (props-array vs json-render slots) before porting.
- `ai-archive/lib/catalog.ts` — the `defineCatalog` composition pattern.
- `aws-archive/packages/schemas/src/index.ts` — Zod 4 idiom already in use (`z.uuid()`, `z.iso.datetime()`, `z.enum(...).default(...)`).

---

## `apps/web/src/components/` renderers + wiring

```
components/
  digestBlocks/Callout/Callout.tsx + Callout.module.css     one folder per content block (19)
  page/DigestPage.tsx, DigestHero.tsx, DigestSection.tsx, SourceMeta.tsx, DigestFooter.tsx (+ .module.css)
  sections/RelatedFromYourBookmarks.tsx, MyNote.tsx          non-catalog, rendered by the page shell directly
lib/registry.ts    defineRegistry(catalog, { components: { Callout: ..., TLDR: ... } })
```

- Content blocks render via json-render: `defineRegistry(catalog, {...})` + `<Renderer>`, converting each section's `content: DigestBlock[]` into child elements. This inherits prompt/validation/state/visibility (FaqItem disclosure, ChecklistItem) for free and matches ai-archive.
- `DigestPage.tsx` (plain React) consumes the typed `DigestPage`: renders `DigestHero` (branches on `source.kind`), `SourceMeta`, then maps `sections` → `DigestSection` (heading/anchorId + json-render content), then `MyNote` / `RelatedFromYourBookmarks` as page-level embeds, then `DigestFooter`.
- Renderers are typed with catalog prop types (or `BaseComponentProps<Props>` from `@json-render/react`). Adapt ai-archive's Tailwind markup into CSS Module classes; keep styling raw/minimal.
- Add `@json-render/core` to web deps if `defineCatalog`'s return type is referenced (already transitive via `@json-render/react`).

---

## Smoke test & housekeeping

- **Smoke test** (`packages/catalog`): one hand-written JSON fixture per content block + one `DigestPage` fixture, each `.parse()`d against its schema, plus a `digestBlockSchema` round-trip. Add `vitest` as a catalog devDep and a real `test` script (currently `echo "no tests yet"`). This is the early shape-mistake tripwire.
- **CLAUDE.md**: none exists in `aws-archive` — create `aws-archive/CLAUDE.md` documenting the monorepo layout, the two-axis catalog model, the `Digest*` naming, the merged/deferred components, and the React-free catalog constraint. Also note the ingestion `plans/phase-0-checklist.md` is superseded by this Phase-1 work.
- **Verify Zod-4 compatibility early** (see below) before porting all 19 blocks.

---

## Task order

1. `enums.ts` — tone, length, difficulty, sourceHealthStatus, digestType.
2. `sourceVariants/` — Chapter, Speaker, written, temporal; discriminated union on `kind` (+ the `hasVideo` comment).
3. **Spike/compat check**: implement `Callout` + `TLDR` `.catalog.ts`, wire `catalog.ts` (`defineCatalog` + stock schema), and confirm `catalog.prompt()` and a `.parse()` both work with zod 4 (json-render 0.19.0 resolves zod 3 internally — see Risks). Fix the approach here before scaling to all blocks.
4. Remaining 17 content-block `.catalog.ts` files + `digestBlocks/catalog.ts` barrel.
5. `page/` shell schemas + `nonCatalog/` schemas.
6. `index.ts` — `DigestBlock` union + `DigestPage` tree + re-exports.
7. Smoke test (vitest + fixtures).
8. Web renderers + `lib/registry.ts` + `DigestPage.tsx`; enable CSS Modules.
9. `CLAUDE.md`.

---

## Verification

- `pnpm --filter @bookmark-digest/catalog typecheck` and `pnpm --filter web typecheck` pass.
- `pnpm --filter @bookmark-digest/catalog test` — all block fixtures + DigestPage fixture parse; the derived `DigestBlock` union rejects an unknown `type`.
- **React-free proof**: `node -e "import('@bookmark-digest/catalog').then(()=>console.log('ok'))"` (or a tsx equiv) resolves without pulling `react` — confirms the package is Lambda-safe.
- **json-render sanity**: log `catalog.prompt()` and confirm it lists the 19 blocks with descriptions and omits `RelatedFromYourBookmarks`/`MyNote`.
- **End-to-end render**: build a hand-authored `DigestPage` fixture (one `written`, one `temporal`), render via `DigestPage.tsx` in `apps/web` (`pnpm --filter web dev`), and confirm hero branches on `source.kind`, sections render their blocks, and MyNote/Related embed. Screenshot to confirm the raw layout holds.

## Risks / watch-outs
- **Zod version skew**: json-render 0.19.0 resolves `zod@3` in its own pnpm tree while our packages use `zod@4`. `defineCatalog`'s `props: s.zod()` stores schemas opaquely, but `catalog.prompt()` / spec validation may assume zod-3 internals. Task 3 spike must confirm this before scaling; fallback is pinning a compatible zod or bridging.
- **List/Grid containment**: decide props-array vs json-render slots/children by inspecting ai-archive before porting — affects both the block schema and the `DigestBlock` union shape.
- **CSS Modules in Next 16**: native, but confirm no Turbopack config gap on first `.module.css` import.
