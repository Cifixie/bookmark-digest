# CLAUDE.md

This project uses a shared memory system with Pi (see AGENTS.md).

- Read wiki/decisions.md, wiki/gotchas.md, wiki/current-work.md before starting work
- Add anything worth remembering to the right file when you finish
- Use [[links]] between related notes

## Stack

- MacBook Pro M5 Pro, 64GB
- Local model: Qwen3.6-35B via oMLX
- Also using Pi (terminal coding agent) alongside Claude

# bookmark-digest — @bookmark-digest monorepo

## Monorepo Layout

```
apps/
  web/              — Vite SPA (renderer consumer)
  infra/            — AWS CDK infrastructure
  mobile/android/   — Android share target (Kotlin/Gradle, outside the pnpm workspace)
packages/
  catalog/          — @bookmark-digest/catalog (two-axis digest schema, React-free)
  schemas/          — @bookmark-digest/schemas (Phase-0 ingestion schemas)
  shared/           — @bookmark-digest/shared (AWS/AI utils, reserved)
```

## Two-Axis Catalog Model

The catalog is built on a **source-variant** + **digest-block** model:

- **Source variants** (`written` | `temporal`) — a discriminated union that determines the hero shape and nested fields. Not registered in `defineCatalog`.
- **Digest blocks** (25 content types) — registered in `defineCatalog`. Each block is `{ type: "<BlockName>", props: <Props> }`.
- **DigestPage** — the typed page tree: `{ source, meta, sections, accentColor }`.

### 25 Content Blocks (all registered)

`TLDR, Prose, List, Grid, Callout, Card, StatCard, FaqItem, GlossaryTerm, Figure, QuoteBlock, CodeBlock, Terminal, ChecklistItem, NextSteps, Prerequisites, LinkItem, ProsCons, Step, ComparisonTable, AuthorCard, TimelineEvent, Chart, PullQuote, ComparisonNarrative`

Every registered block needs a renderer in `apps/web/src/lib/registry.tsx`. Missing
one is otherwise silent (the generator emits it, validation passes, the page shows
nothing), so `registry.tsx` throws at module load if any block type is unrendered.

`SectionContainer` is also registered alongside these but is structural, not
content — the root layout wrapper for a `DigestSection`'s Spec, not something a
model reaches for to convey information.

### Non-catalog sections (standalone schemas, NOT in defineCatalog)

`RelatedFromYourBookmarks` (vector-similarity retrieval — brute-force cosine similarity over DynamoDB, see `plans/dynamodb-migration.md`), `MyNote` (user-authored) — embedded into the page separately by the renderer.

### Cut

`DecisionItem` — no concrete use case surfaced; not built (see `plans/phase-2-scope.md`).

## Component Naming

All digest components use the `Digest*` prefix for page shell elements and raw names for content blocks. `Summary*` (old naming) has been replaced.

Mergers:

- `MythVsReality` → `Callout` with `variant: "misconception"`
- `TranscriptQuote` → `QuoteBlock` (gains optional `timestampSeconds`)
- `VideoHero/Chapter/Speaker` → nested fields on `temporal` source variant

## React-Free Catalog

`packages/catalog` must remain React-free (imported by both web app and validation Lambdas). Renderers live in `apps/web/src/components`.

## Digest Generation: Two Independent Axes

Both live in `apps/infra/lib/digest-goals.ts` and are composed into the **system**
prompt (goal template, then mode template, then `GROUNDING_RULES`, then
`catalog.prompt()`). The user turn carries only the source material — never shape
instructions, or the two fight.

- **`digestGoal`** — depth and voice: `tl_dr` | `summary` | `understand`.
  Applies to every digest. Templates are written in the singular.
- **`sourceMode`** — how a bundle's sources relate: `synthesize` (default) |
  `compare` | `evolution`. Multi-source only. Owns page composition, and comes
  after the goal template so it overrides that singular voicing.

`GROUNDING_RULES` is not an axis — it applies to every digest and is composed
last so it outranks both templates. It exists because validation checks that
props fit their schema, never that content came from the source: given thin
material, a model asked for thoroughness will invent content that validates
cleanly. See `plans/thin-source-detection.md` for the input-side counterpart,
still unbuilt.

Source count does **not** imply shape. Two articles by one author on one subject
want `synthesize` (merge, don't attribute per source, no ComparisonTable across
sources); competing reviews want `compare`; sources across time want `evolution`.
Asserting comparison for all bundles produces contests that aren't there.

## State Machine

```
ingestion submitted → received → processing → done/failed
```

Phase-0 checks in `plans/phase-0-checklist.md` are **superseded** by Phase-1 work (this catalog).

## Data Storage (DynamoDB)

Defined in `apps/infra/lib/bookmark-digest-stack.ts` (both `TableV2`, on-demand
billing, `RemovalPolicy.RETAIN`). Deploys to stack `BookmarkDigest`, account
`032080729840`, region `eu-north-1`. Physical names are CloudFormation-generated
(no fixed `tableName`) — read them from stack outputs `SourcesTableName` /
`DigestsTableName`, or from the `SOURCES_TABLE_NAME` / `DIGESTS_TABLE_NAME` Lambda
env vars. Persistence helpers live in `apps/infra/lib/dynamo.ts`.

- **SourcesTable** — ingested source content + embeddings.
  - PK: `contentHash` (String)
  - GSI `UrlIndex`: PK `url` (String)
  - DynamoDB Stream (`NEW_IMAGE`) triggers the `embed-source` Lambda.
  - PITR enabled, deletion protection on.
- **DigestsTable** — generated digest content (the compiled Spec tree, in `output`).
  - PK: `id` (String) — a fresh `randomUUID()` per digest request, **not** the
    content hash.
  - GSI `SourceHashIndex`: PK `sourceHash` (String), SK `digestGoal` (String) —
    this is how you look up a digest by source + goal (dedup lookups use
    `digestsQueryBySourceHash`).
  - For multi-source digests, `sourceHash` is `hashes[0]`; the full list is in
    `sourceHashes: string[]`, plus optional `sourceMode`.
  - Item shape: `{ id, sourceHash, sourceHashes?, sourceMode?, digestGoal,
    paramsVersion, status, output?, error?, model?, createdAt, updatedAt,
    completedAt? }`.

# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
