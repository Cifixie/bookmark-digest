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
`RelatedFromYourBookmarks` (vector-similarity retrieval — brute-force cosine similarity over DynamoDB, see `plans/dynamodb-migration.md`), `MyNote` (user-authored) — embedded into the page separately by the renderer.

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
