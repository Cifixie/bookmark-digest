# bookmark-digest

A two-phase system that ingests web content (URLs, pasted text, videos) and generates structured,
AI-powered digest pages using LLMs — stored in DynamoDB and served via a React SPA on AWS.

> **Direction (2026-09-03):** the project is pivoting to a two-fork
> architecture. What's described below is **Fork B** — kept and maintained, no
> longer the primary direction. The new primary is **Fork A ("Sediment")**: an
> accumulation substrate where the act of saving is the signal and the output
> is what emerges across saves, not a digest of any one item. The two share
> ingestion, retrieval, and LLM plumbing, bridged by a Source-level TL;DR and
> extraction structure computed once per source.
>
> Read `docs/two-fork-architecture.md` before starting work; the queue is in
> `plans/ROADMAP.md`.

## Architecture

```
URLs / text / videos
  │
  ├─ ingest-url Lambda ─→ DynamoDB SourcesTable ──┐
  │   (fetch via Firecrawl, dedup, store)          │
  │                                                │
  └─ embed-source Lambda (stream trigger) ────────┘
     (Bedrock embedding → DynamoDB)
                                              │
                    multi-source digests ─────┘
                        │
                  POST /digests
                        │
                  generate-digest Lambda
                        │
                  generate-digest-worker Lambda
                        │
                  Gemini / Claude Haiku
                        │
                  zod validation + catalog rules
                        │
                  DynamoDB DigestsTable
                        │
                  GET /digests/:id
                        │
                apps/web (React SPA)
                  Vite + Storybook
                  @json-render/react
```

**Deployment target:** `BookmarkDigest` stack, `eu-north-1`, account `032080729840`.

## Monorepo Layout

```
apps/
  web/              — Vite SPA (client-side React, Storybook, Vitest)
  infra/            — AWS CDK (TypeScript) infrastructure + Lambda functions
packages/
  catalog/          — @bookmark-digest/catalog  (typed schemas for 25 digest content blocks + 1 structural)
  schemas/          — @bookmark-digest/schemas   (Phase-0 + Phase-1 data model, Zod)
  shared/           — @bookmark-digest/shared    (reserved: AWS/AI utilities)
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Type-check everything
pnpm typecheck

# Run tests
pnpm test

# Start the web app locally
pnpm dev

# Build all packages
pnpm build

# Deploy to AWS (web + infra)
pnpm deploy
```

**Requirements:** Node ≥ 24, pnpm ≥ 11.

## What It Does

bookmark-digest follows a **two-axis model**:

1. **Source variant** — `written` (article) or `temporal` (video/podcast)
   Determines the hero section shape and available fields.

2. **Digest goal** — `tl_dr` | `summary` | `understand`
   Controls depth and voice of the generated output.

3. **Source mode** (multi-source only) — `synthesize` | `compare` | `evolution`
   Controls how multiple sources relate on a single page.

LLMs generate a **json-render Spec tree** (root + keyed elements) that is
validated against a typed catalog and stored in DynamoDB. The SPA renders
it client-side via `@json-render/react`.

### Content Blocks (25 content + 1 structural)

All LLM-authored content blocks are schema-validated at ingest time:

| Block | Block | Block |
|-------|-------|-------|
| TLDR | Prose | List |
| Grid | Callout | Card |
| StatCard | FaqItem | GlossaryTerm |
| Figure | QuoteBlock | CodeBlock |
| Terminal | ChecklistItem | NextSteps |
| Prerequisites | LinkItem | ProsCons |
| Step | ComparisonTable | AuthorCard |
| TimelineEvent | Chart | PullQuote |
| ComparisonNarrative | | |

23 blocks are used by models to convey content. `SectionContainer` is structural (layout wrapper for sections). `DecisionItem` was cut before implementation (see `plans/archive/phase-2-scope.md`).

### Non-Catalog Sections

- `RelatedFromYourBookmarks` — vector-similarity retrieval (brute-force cosine
  similarity over DynamoDB embeddings, see `plans/archive/dynamodb-migration.md`)
- `MyNote` — user-authored annotations

## AWS Infrastructure

Deployed via `apps/infra` — a monolithic CDK stack named `BookmarkDigest`.

### DynamoDB Tables

| Table | PK | Key Feature |
|-------|----|-------------|
| SourcesTable | `contentHash` | URL-indexed GSI, DynamoDB stream → embed-source |
| DigestsTable | `id` | Source-hash + goal GSI for dedup lookups |

Both use on-demand billing, PITR, deletion protection, and `RETAIN` removal policy.

### Lambda Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `ingest-url` | Accept URL, fetch via Firecrawl, dedup, store | POST /sources |
| `embed-source` | Generate Bedrock embedding | SourcesTable stream (INSERT) |
| `generate-digest` | Validate request, start async worker | POST /digests |
| `generate-digest-worker` | Call Gemini/Bedrock, validate, store result | Async invoke |
| `fetch-source` | Look up a source by hash | GET /sources/:id |
| `fetch-digest` | Look up a digest result | GET /digests/:id |
| `list-sources` | List all ingested sources | GET /sources |
| `related-sources` | Cosine similarity search | GET /sources/:id/related |
| `digest-goals` | Return available goals config (no DB) | GET /digest-goals |
| `check-embed-failures` | Scan for stale failures, send SNS alerts | EventBridge cron (daily 06:00 UTC) |

### Other Services

- **Cognito User Pool** — auth for API Gateway (SRP flow)
- **API Gateway REST API** — routes `/sources`, `/digest-goals`, `/digests`
- **S3 + CloudFront** — hosts the Vite SPA with SPA fallback routing
- **SNS** — embed failure alerts (optional email subscription)
- **EventBridge** — schedules the daily embed-failure checker

### Secrets (managed outside the stack)

- `GEMINI_API_KEY` — Personal Gemini API key (Secrets Manager, created out-of-band)
- `FIRECRAWL_API_KEY` / `FIRECRAWL_API_URL` — Firecrawl credentials (env vars)

## State Machine

```
ingestion:  submitted → received → processing → done / failed
digest:     pending → generating → done / failed
source:     fetched → embedding → ready / failed
```

## Design Decisions

- **Two-axis generation** — digest goal (depth/voice) and source mode (relationship)
  are separate and composed into the system prompt in a fixed order so they don't fight.
- **Async digest generation** — the worker Lambda bypasses API Gateway's 29s integration
  timeout. The caller gets a `pending` response and polls for completion.
- **No native vector index** — DynamoDB's native vector index was tried and reverted at
  this data scale. Brute-force cosine similarity over embeddings is the current approach.
- **React-free catalog** — `@bookmark-digest/catalog` has zero React deps; it's imported
  by both the web app and validation Lambdas. Renderers live exclusively in `apps/web`.
- **Silent failure guard** — every catalog block must have a renderer in `registry.tsx`.
  Missing ones throw at module load, not silently at render time.

## Plans & Documentation

| File | Content |
|------|---------|
| `wiki/decisions.md` | Architecture decision log |
| `wiki/gotchas.md` | Known pitfalls and workarounds |
| `wiki/current-work.md` | Active work items |
| `docs/two-fork-architecture.md` | **Start here** — Fork A / Fork B / the bridge; where new work goes |
| `docs/rules.md` | Standing generation/tone/scope rules |
| `plans/ROADMAP.md` | The queue, in order |

### Fork A plans (Sediment — primary, none built yet)

| File | Content |
|------|---------|
| `plans/s3-source-of-truth.md` | S3 canonical for raw + extracted content (queue item 1) |
| `plans/extraction-and-tldr.md` | Source-level TL;DR + extraction structure — the fork bridge (item 2) |
| `plans/source-health.md` | SourceHealth v1: recheck, paywall flag, overrides, file upload (item 3) |
| `plans/substrate-tagging-and-dedup.md` | Auto-tagging + near-duplicate collapsing — **hard gate** (item 4) |
| `plans/emergence-feed.md` | First Sediment surface: TL;DR + relational reactions (item 5) |
| `plans/fork-b-reads-extraction.md` | Point Fork B's generation at the extraction structure (item 6) |
| `plans/interest-profile.md` | Derived interest profile; user-scoping requirement (item 7) |
| `plans/paper-entity.md` | Paper entity (Track 3) — parked, schema decided in advance |
| `plans/prior-art.md` | Repo evaluations and what each contributed |

### Fork B plans (rendered digests — kept, secondary)

| File | Content |
|------|---------|
| `plans/explore-agent.md` | "Explore this" topic-driven agent — still unbuilt |
| `plans/multi-catalog-gating.md` | `allowedBlockTypes` — deferred with a trigger |
| `plans/digest-metadata-completeness.md` | Multi-source `DigestMeta` — shipped |
| `plans/suggested-bundles.md` | `inferSourceMode` + related sources — shipped |
| `plans/source-detail-page.md` | `/sources/:contentHash` — shipped |
| `plans/source-quality-and-upload.md` | Thin-fetch detection Part A — shipped; forward half → `source-health.md` |
| `plans/PARKED.md` | Ideas parked without a trigger |
| `plans/archive/` | Iteration-1 phase-N plans, kept for historical record |

## Directory Reference

```
├── apps/
│   ├── web/                    — React SPA (Vite + Storybook + Vitest)
│   │   ├── src/app/            — Routes, Auth, Router
│   │   ├── src/components/     — Digest page & content-block components
│   │   └── src/lib/            — Registry, API client, Amplify config
│   └── infra/                  — CDK stack + Lambda functions
│       ├── lambdas/            — 9 handler dirs (10 functions, TS)
│       ├── lib/                — Stack definition, config, Dynamo helpers
│       ├── scripts/            — Dev utilities (e.g. youtube-transcript.ts)
│       └── dist/               — Compiled output (gitignored in CI)
├── packages/
│   ├── catalog/                — 25 content block schemas + 1 structural
│   ├── schemas/                — Phase-0/1 data model (Zod)
│   └── shared/                 — Reserved (AWS/AI utilities)
├── plans/                      — Design documents for each phase
├── wiki/                       — Project memory (decisions, gotchas, current work)
├── docs/                       — Generated references & summaries
├── package.json                — Root workspace (pnpm)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── AGENTS.md / CLAUDE.md       — AI agent instructions
```

## Contributing

This is a single-developer project. Before making changes:

1. Read `AGENTS.md` and `CLAUDE.md` for project conventions
2. Check `wiki/decisions.md` and `wiki/current-work.md` for context
3. Keep `wiki/` files updated as you go
