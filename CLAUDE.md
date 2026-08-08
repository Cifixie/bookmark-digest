# aws-archive — @bookmark-digest monorepo

## Monorepo Layout

```
apps/
  web/              — Next.js 16 app (renderer consumer)
  infra/            — AWS CDK infrastructure
packages/
  catalog/          — @bookmark-digest/catalog (two-axis digest schema, React-free)
  schemas/          — @bookmark-digest/schemas (Phase-0 ingestion schemas)
  shared/           — @bookmark-digest/shared (AWS/AI utils, reserved)
```

## Two-Axis Catalog Model

The catalog is built on a **source-variant** + **digest-block** model:

- **Source variants** (`written` | `temporal`) — a discriminated union that determines the hero shape and nested fields. Not registered in `defineCatalog`.
- **Digest blocks** (19 content types) — registered in `defineCatalog`. Each block is `{ type: "<BlockName>", props: <Props> }`.
- **DigestPage** — the typed page tree: `{ source, meta, sections, accentColor }`.

### 19 Content Blocks (all registered)
`TLDR, Prose, List, Grid, Callout, Card, StatCard, FaqItem, GlossaryTerm, Figure, QuoteBlock, CodeBlock, Terminal, ChecklistItem, NextSteps, Prerequisites, LinkItem, ProsCons, Step`

### Non-catalog sections (standalone schemas, NOT in defineCatalog)
`RelatedFromYourBookmarks` (pgvector retrieval), `MyNote` (user-authored) — embedded into the page separately by the renderer.

### Deferred (Tier 3)
`ComparisonTable/Versus, TimelineEvent, DecisionItem, AuthorCard`

## Component Naming

All digest components use the `Digest*` prefix for page shell elements and raw names for content blocks. `Summary*` (ai-archive naming) has been replaced.

Mergers:
- `MythVsReality` → `Callout` with `variant: "misconception"`
- `TranscriptQuote` → `QuoteBlock` (gains optional `timestampSeconds`)
- `VideoHero/Chapter/Speaker` → nested fields on `temporal` source variant

## React-Free Catalog

`packages/catalog` must remain React-free (imported by both web app and validation Lambdas). Renderers live in `apps/web/src/components`.

## State Machine

```
ingestion submitted → received → processing → done/failed
```

Phase-0 checks in `plans/phase-0-checklist.md` are **superseded** by Phase-1 work (this catalog).
