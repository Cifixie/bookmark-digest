# Phase-1 Execution Plan (SUPERSEDED)

> ⚠️ **This plan is superseded by [`plans/dynamodb-migration.md`](dynamodb-migration.md).**
> Aurora has been replaced by DynamoDB for this project. See the migration plan for
> the current architecture (DynamoDB tables, streams-based triggers, shared doc-client).
> This doc is preserved for historical context only — it describes the original
> Postgres/pgvector approach that was abandoned.

**Original Goal:** Wire Postgres + pgvector into the CDK stack, build out the core data pipeline (ingest → embed → digest), expose API endpoints, and dogfood end-to-end.

**Current architecture:** See [`plans/dynamodb-migration.md`](dynamodb-migration.md) — DynamoDB `Sources` + `Digests` tables with on-demand billing, stream-triggered embedding, and a shared `lib/dynamo.ts` doc-client wrapper.

**Assumptions:**
- Phase-0 stack (`BookmarkDigestPhase0`) is already deployed and functional
- AWS credentials are configured with `eu-north-1` region
- Vercel AI SDK (`ai` v7) and Bedrock access are available to all Lambdas
- The existing `BookmarkDigest` stack (the non-Phase-0 named one in `bookmark-digest-stack.ts`) can be extended or a new `BookmarkDigestPhase1` created

---

## Step 2: Provision Postgres + pgvector

### 2.1 Decide: RDS Aurora Serverless v2 vs. RDS PostgreSQL
| Option | Pros | Cons |
|--------|------|------|
| **Aurora Serverless v2** | Auto-scales to zero, on-demand provisioned capacity | Still provisions VPC subnets, slightly higher baseline cost |
| **RDS PostgreSQL** | Simpler, cheaper at low usage, `pgvector` extension ready | Manual scaling (but deviation is easy), must keep running |

**Recommendation: Aurora Serverless v2** — low traffic (personal tool), scales to zero overnight, and when you're actively dogfooding it bursts to handle work.

### 2.2 CDK changes
In `apps/infra/lib/bookmark-digest-stack.ts`, add:

```ts
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
```

**Resources to provision:**
1. **VPC** — 2 private subnets + 1 public subnet (for bastion/SSH if needed) + Internet Gateway
2. **Security group** — allow inbound 5432 from Lambda execution role via IAM auth (or security group)
3. **Aurora Serverless v2 DB cluster** — PostgreSQL 16+ (need `pgvector` >= 0.7)
   - `engine: rds.DatabaseEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_16_4 })`
   - `vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }`
   - `enableHttpEndpoint: true` (convenient for testing)
   - `storageEncrypted: true`
   - `deletionProtection: true`
4. **Secrets Manager secret** — Aurora will store the admin credentials here (CDK `Secret.fromSecretsManager()`)
5. **Secrets Manager secret for pgvector connection** — or use the same
6. **Lambda security group** — allow outbound to Aurora SG on 5432
7. **IAM role policy** — Lambda needs `secretsmanager:GetSecretValue` and optionally `rds-db:connect`

**Connectivity from Lambda:**
- Both Lambda and Aurora must be in the **same VPC** (Lambda configured with `vpc` + `vpcSubnets` + `securityGroup`)
- Lambda needs `internetAccess: true` (NAT gateway) if it needs to fetch URLs
- Best: Lambda in private subnets → Aurora in same private subnets → Lambda uses Aurora SG for DB access → Lambda uses NAT GW for outbound HTTP

**CDK outputs to add:**
- `DbEndpoint` — cluster endpoint
- `DbSecretArn` — for Lambdas to reference

### 2.3 Validation
- `npx cdk diff` shows the new resources
- `npx cdk deploy` succeeds
- Verify Aurora is running with `psql` from a Lambda inline: `\dx` shows `pgvector`

---

## Step 3: Draft and Apply the Sources/Digests Schema

### 3.1 Define tables (SQL DDL — verified against `pgvector` types)

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

--
-- SOURCES: keyed by content hash, stores the "source of truth"
--
CREATE TABLE sources (
  content_hash  text PRIMARY KEY,              -- SHA-256 of extracted text
  url           text NOT NULL,                  -- original URL
  content       text,                           -- extracted readable content
  content_type  text DEFAULT 'article',         -- 'article', 'video', 'unknown'
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  fetched_by    text,                           -- 'firecrawl', 'yt-dlp', ...
  status        text NOT NULL DEFAULT 'fetched',-- 'fetched', 'embedding', 'ready'

  -- Embedding (only populated after embedding step)
  embedding     vector(1536),                   -- OpenAI or Bedrock text-embeddings model dimension
  embedding_model text,                         -- which model produced the embedding
  embedding_at  timestamptz
);

-- Index for semantic search
CREATE INDEX idx_sources_embedding ON sources USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Unique constraint on URL for quick duplicate-checking
CREATE UNIQUE INDEX idx_sources_url ON sources (url);

--
-- DIGESTS: catalog-driven, referencing a Source
--
CREATE TABLE digests (
  id              text PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash     text NOT NULL REFERENCES sources(content_hash) ON DELETE CASCADE,
  digest_goal     text NOT NULL,               -- 'summary', 'tl_dr', 'notes', ... (NOT @bookmark-digest/catalog's `digestType` enum — see Step 5.2)
  modifiers       jsonb DEFAULT '{}',          -- goal-specific params (e.g., {format: 'bullet', detail: 'comprehensive'})
  params_version  text NOT NULL,               -- which catalog package version produced this digest
  status          text NOT NULL DEFAULT 'pending',-- 'pending', 'generating', 'done', 'failed'
  output          jsonb,                        -- DigestBlock[] JSON, validated against @bookmark-digest/catalog's digestBlockSchema
  error           text,
  model           text,                        -- 'anthropic.claude-sonnet-v4:0', ...
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX idx_digests_source ON digests (source_hash);
CREATE INDEX idx_digests_goal ON digests (digest_goal);
```

### 3.2 Where this lives
- **DDL script:** `apps/infra/db/migrations/001_sources_digests.sql`
- **CDK:** No resource — use `aws rds modify-db-cluster` or connect via Lambda to run migrations on first deploy
- **Option:** Use a one-shot Lambda post-deploy that runs `pg_isready` + `psql` to apply migrations, or use `db:migrate` in a GitHub Action

### 3.3 Zod schemas to add to `packages/schemas/src/index.ts`

```ts
// Source schemas
export const sourceStatus = z.enum(["fetched", "embedding", "ready"]);
export type SourceStatus = z.infer<typeof sourceStatus>;

export const sourceSchema = z.object({
  contentHash: z.string(),
  url: z.string().url(),
  content: z.string().nullable(),
  contentType: z.enum(["article", "video", "unknown"]),
  fetchedAt: z.iso.datetime(),
  fetchedBy: z.string().nullable(),
  status: sourceStatus,
  embedding: z.array(z.number()).nullable(),
  embeddingModel: z.string().nullable(),
  embeddingAt: z.iso.datetime().nullable(),
});
export type Source = z.infer<typeof sourceSchema>;

// Digest schemas
export const digestStatus = z.enum(["pending", "generating", "done", "failed"]);
export type DigestStatus = z.infer<typeof digestStatus>;

// NOTE: this is deliberately NOT named `digestType` / `digestTypeSchema` — that
// name is already taken by @bookmark-digest/catalog's `digestType` enum
// (article/video/podcast/tutorial/news/review), which classifies the SOURCE
// content, not the kind of digest being requested. `digestGoal` here answers
// "what should the digest do" (summarize, extract action items, ...); see
// Step 5.2 for how goals map onto the catalog's content blocks.
export const digestGoalSchema = z.enum(["summary", "tl_dr", "notes", "action_items", "key_points"]);
export type DigestGoal = z.infer<typeof digestGoalSchema>;

export const digestSchema = z.object({
  id: z.string(),
  sourceHash: z.string(),
  digestGoal: digestGoalSchema,
  modifiers: z.record(z.string(), z.any()).default({}),
  paramsVersion: z.string(),
  status: digestStatus,
  // DigestBlock[] from @bookmark-digest/catalog, validated with
  // `z.array(digestBlockSchema)` before it's persisted — not freeform text.
  output: z.array(z.record(z.string(), z.unknown())).nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Digest = z.infer<typeof digestSchema>;
```

### 3.4 New API request/response schemas

```ts
// Submit URL for ingestion (new endpoint)
export const ingestUrlRequestSchema = z.object({
  url: z.string().url(),
});

// List available digest goals (static config, see Step 5.2 — NOT the
// @bookmark-digest/catalog content-block catalog, which has its own
// GET /catalog handler described below)
export const listDigestGoalsResponseSchema = z.object({
  goals: z.array(z.object({
    goal: z.string(),
    label: z.string(),
    description: z.string(),
    allowedBlockTypes: z.array(z.string()), // subset of @bookmark-digest/catalog's DigestBlock type names
    modifiers: z.array(z.object({
      key: z.string(),
      label: z.string(),
      options: z.array(z.string()),
    })),
  })),
  version: z.string(),
});

// Request a digest for a source
export const requestDigestRequestSchema = z.object({
  sourceHash: z.string(),
  digestGoal: digestGoalSchema,
  modifiers: z.record(z.string(), z.any()).optional().default({}),
});

export const requestDigestResponseSchema = z.object({
  digestId: z.string(),
  status: z.literal("accepted"),
});

// Fetch digest result
export const fetchDigestResponseSchema = z.object({
  id: z.string(),
  digestGoal: z.string(),
  modifiers: z.record(z.string(), z.any()),
  status: digestStatus,
  output: z.array(z.record(z.string(), z.unknown())).nullable(), // DigestBlock[]
  error: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
```

---

## Step 4: Source Ingestion Pipeline

### 4.1 Lambda: `ingest-url`
**Entry:** `apps/infra/lambdas/ingest-url/handler.ts`

**Flow:**
1. Receive `POST /sources` with `{ url }`
2. Validate with `ingestUrlRequestSchema`
3. **Dedup check:** Query `SELECT content_hash FROM sources WHERE url = $1`
   - If exists and `status = 'ready'`: return `{ sourceHash, status: 'exists' }` (no-op)
   - If exists but not ready: still proceed (idempotent re-ingest)
4. **Fetch content:** Call Firecrawl (or fallback scraper)
   - Extract readable text from HTML
   - For videos, extract title + transcript
5. **Hash content:** `crypto.createHash('sha256').update(text).digest('hex')`
6. **Upsert Source:**
   ```sql
   INSERT INTO sources (content_hash, url, content, content_type, fetched_at, fetched_by, status)
   VALUES ($1, $2, $3, $4, now(), 'firecrawl', 'fetched')
   ON CONFLICT (content_hash) DO NOTHING;
   -- If 0 rows affected, source already exists
   ```
7. If **new** source: queue for embedding (next step)
8. Return `{ sourceHash, status: 'new' | 'existing' }`

**Dependencies:** `pg` (node-postgres or `@libsql/client`), `cheerio` or `@mozilla/readability` for HTML extraction, Firecrawl SDK (or HTTP client)

### 4.2 Lambda: `embed-source` (triggered after ingest)
**Entry:** `apps/infra/lambdas/embed-source/handler.ts`

**Flow:**
1. Query for sources with `status = 'embedding'` (or a new `enqueue_embedding` step in Step Functions)
2. For each: call Bedrock `amazon.titan-embed-text-v2:0` (or OpenAI equivalent)
   - Model returns 1536-dim vector
3. Upsert: `UPDATE sources SET embedding = $1, embedding_model = $2, embedding_at = now(), status = 'ready' WHERE content_hash = $3`
4. Return count of embedded sources

**Step Functions integration:**
Extend the existing state machine:
```
Received → Processing: {
  StateMachine.StartExecution for ingest-url Lambda →
  Wait (brief) →
  Embedding: {
    StateMachine.StartExecution for embed-source Lambda →
  } →
  Done
}
```

### 4.3 Database connection helper
Create `apps/infra/lib/db.ts` (shared between Lambdas):
```ts
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
// or plain pg with Secrets Manager

export async function getDbClient() {
  // Pull RDS credentials from Secrets Manager
  // Return pg.Client or RDSDataClient
}
```

---

## Step 5: Digest Generation Service

### 5.1 Lambda: `generate-digest`
**Entry:** `apps/infra/lambdas/generate-digest/handler.ts`

**Flow:**
1. Receive `POST /digests` with `{ sourceHash, digestGoal, modifiers }`
2. Validate with `requestDigestRequestSchema`
3. **Prompt assembly** (catalog-driven, using the real `@bookmark-digest/catalog` package — see 5.2):
   - Lookup `digestGoal` in `DIGEST_GOALS` (5.2) for its `allowedBlockTypes` + prompt template + expected modifiers
   - Call `catalog.prompt()` from `@bookmark-digest/catalog`, filtered/restricted to `allowedBlockTypes`, to get the block descriptions the model is allowed to author
   - Fetch Source row (content)
   - Template: ``system: "You are a digest assistant. Goal: {digestGoal}. Modifiers: {modifiers}.\n\n{catalogPrompt}\n\nRespond with a JSON array of blocks matching the schema above.\n\nContent:\n{content}"``
4. Call Bedrock via Vercel AI SDK's `generateObject` (not `streamText` — output must be structured, not prose):
   ```ts
   import { anthropic } from "@ai-sdk/anthropic";
   import { z } from "zod";
   import { digestBlockSchema } from "@bookmark-digest/catalog";

   const { object: blocks } = await generateObject({
     model: anthropic("anthropic.claude-sonnet-v4-0"),
     system: assembledPrompt,
     schema: z.array(digestBlockSchema),
     maxTokens: 2048,
   });
   ```
5. Re-validate `blocks` against `digestBlockSchema` (defense in depth beyond `generateObject`'s own schema enforcement) → save the validated `DigestBlock[]` JSON to `digests.output` (jsonb)
6. Update digest row: `status = 'done', model = 'anthropic.claude-sonnet-v4-0', completed_at = now()`
7. Return `{ digestId, status: 'done' }`

### 5.2 Digest goals config (NOT a second catalog)

`@bookmark-digest/catalog` (built in `plans/phase-1-catalog.md`) already defines the 19 content blocks (`TLDR`, `Prose`, `List`, ...) via `defineCatalog` — that package is the single source of truth for what an LLM can author and how it's validated (`digestBlockSchema`, `catalog.prompt()`). This step does **not** define a second, competing `catalogSchema`/`defineCatalog` — an earlier draft of this plan did, before Part A's catalog existed, and it's since been superseded. Do not recreate `packages/catalog/src/index.ts`; import from it instead.

What's actually missing is a much smaller thing: a static mapping from "what the user asked for" (a `digestGoal` — summary, tl_dr, notes, action_items, key_points) to "which of the 19 blocks are appropriate for that goal" plus the goal's own prompt framing and modifiers. This is app-level config, not an LLM-authored catalog component, so it lives outside `packages/catalog` (which stays reserved for the two-axis block/page model) — e.g. `apps/infra/lib/digest-goals.ts`, imported by both the `generate-digest` and `GET /digest-goals` (see 6.1) Lambdas:

```ts
import type { DigestBlock } from "@bookmark-digest/catalog";
import { digestGoalSchema, type DigestGoal } from "@bookmark-digest/schemas";

interface DigestGoalConfig {
  goal: DigestGoal;
  label: string;
  description: string;
  promptTemplate: string;                 // "{modifiers}" interpolation, filled in at call time
  allowedBlockTypes: DigestBlock["type"][]; // restricts which catalog blocks the model may emit
  modifiers: Array<{
    key: string;
    label: string;
    description: string;
    options: string[];
    default?: string;
  }>;
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
      { key: "format", label: "Format", description: "Output format for notes", options: ["bullet", "paragraph", "markdown"], default: "bullet" },
      { key: "detail", label: "Detail level", options: ["brief", "comprehensive"], default: "comprehensive" },
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

export function getDigestGoal(goal: DigestGoal): DigestGoalConfig {
  const found = DIGEST_GOALS.find(g => g.goal === goal);
  if (!found) throw new Error(`Unknown digest goal: ${goal}`);
  return found;
}
```

The block choices above are illustrative — revisit them during dogfooding (Step 8).

---

## Step 6: API Layer (Extended Endpoints)

### 6.1 New routes on existing API Gateway

| Method | Path | Authorizer | Handler | Description |
|--------|------|------------|---------|-------------|
| `POST` | `/sources` | Cognito | `ingest-url` | Submit URL for ingestion (dedup + fetch) |
| `GET`  | `/sources/{sourceHash}` | Cognito | Lambda Proxy | Fetch a Source (with optional embedding) |
| `GET`  | `/digest-goals` | None* | Static | Return `DIGEST_GOALS` (5.2) as JSON — what the picker UI renders |
| `POST` | `/digests` | Cognito | `generate-digest` | Request a digest for a source |
| `GET`  | `/digests/{digestId}` | Cognito | Lambda Proxy | Fetch a digest result |
| `GET`  | `/digests?sourceHash=...` | Cognito | Lambda Proxy | List digests for a source |

*\*`/digest-goals` endpoint can be public or Cognito-authorized; public is simpler since it's just config. Note this is deliberately not named `/catalog` — that name is reserved for a future endpoint exposing `@bookmark-digest/catalog`'s block schema itself (e.g. for tooling/debugging), which is a distinct concept from the digest-goal picker.*

### 6.2 Route adders in `bookmark-digest-stack.ts`

```ts
// New resources
const sources = api.root.addResource("sources");
const sourceHash = sources.addResource("{sourceHash}");
const digests = api.root.addResource("digests");
const digestId = digests.addResource("{digestId}");
const digestGoals = api.root.addResource("digest-goals");

// GET /digest-goals (no authorizer)
digestGoals.addMethod("GET", new apigw.LambdaIntegration(digestGoalsFn, { proxy: true }), {
  // No authorizer - this is just static config (DIGEST_GOALS from 5.2)
});

// POST /sources (Cognito auth)
sources.addMethod("POST", new apigw.LambdaIntegration(ingestUrlFn, { proxy: true }), {
  authorizer,
  authorizationType: apigw.AuthorizationType.COGNITO,
});

// GET /sources/{sourceHash} (Cognito auth)
sourceHash.addMethod("GET", new apigw.LambdaIntegration(fetchSourceFn, { proxy: true }), {
  authorizer,
  authorizationType: apigw.AuthorizationType.COGNITO,
});

// POST /digests (Cognito auth)
digests.addMethod("POST", new apigw.LambdaIntegration(generateDigestFn, { proxy: true }), {
  authorizer,
  authorizationType: apigw.AuthorizationType.COGNITO,
});

// GET /digests/{digestId} (Cognito auth)
digestId.addMethod("GET", new apigw.LambdaIntegration(fetchDigestFn, { proxy: true }), {
  authorizer,
  authorizationType: apigw.AuthorizationType.COGNITO,
});

// GET /digests?sourceHash=... (Cognito auth)
// Use a separate resource or query-string passthrough
```

### 6.3 Lambda deployment
Add all Lambdas as `NodejsFunction` entries with appropriate:
- `vpc` and `vpcSubnets` (same VPC as Aurora)
- `securityGroup` (allow DB access + outbound HTTP for Firecrawl)
- `environment` vars: `DATABASE_SECRET_ARN`, `BEDROCK_MODEL_ID`, `FIRECRAWL_API_KEY`
- IAM policies: Secrets Manager, Bedrock runtime, RDS Data (or SG-based DB access)

---

## Step 7: Branch-Tree UI, Minimum Viable

### 7.1 Frontend changes (`apps/web/src/app/page.tsx`)

Current state: single URL submit → mock response.
Target state: **Submit URL → show source → show digest-goal picker → select digests → render results as catalog blocks.**

```
[Submit URL]
    ↓
Source status: "fetched" → Source loaded
    ↓
┌─ Digest Goals (from GET /digest-goals) ─────┐
│  ☐ Summary        [Generate]                 │
│  ☐ TL;DR          [Generate]                 │
│  ☐ Notes          [Generate]                  │
│     format: [bullet ▼]  detail: [comprehensive ▼]│
│  ☐ Action Items   [Generate]                 │
└──────────────────────────────────────────────┘
    ↓ (after generating)
┌─ Digest Results (rendered via apps/web's DigestBlock registry) ─┐
│ Summary  → <Prose>                                              │
│ TL;DR    → <TLDR> / <List>                                      │
│ Notes    → <List> / <Card> / <GlossaryTerm>                     │
└───────────────────────────────────────────────────────────────┘
```

Each digest's `output` is a `DigestBlock[]` (validated against `@bookmark-digest/catalog`'s `digestBlockSchema` — see Step 5.1), so results are rendered with the **same block registry already built in `plans/phase-1-catalog.md`** (`apps/web/src/lib/registry.ts` + the `digestBlocks/*` renderers), not as raw text. This is the payoff of routing digest generation through the real catalog: the frontend gets structured, typed content for free instead of parsing prose.

### 7.2 Components to add

1. **`@/components/SourceCard`** — Displays source info + status
2. **`@/components/DigestGoalPicker`** — UI for selecting a digest goal + its modifiers
   - Renders `goal.label` + `goal.description` (from `GET /digest-goals`)
   - For each modifier, renders a selector (dropdown for enum, text input for freeform)
3. **`@/components/DigestResult`** — Renders a digest's `DigestBlock[]` output by mapping each block through the existing `apps/web/src/lib/registry.ts` component lookup (reuse it directly rather than duplicating the block→component mapping)
4. **`@/components/GoalList`** — Flat list of digest goals from `DIGEST_GOALS`; no tiers/grouping — the earlier draft's Tier 1/Tier 2 grouping was part of the superseded from-scratch catalog sketch (see Step 5.2) and doesn't apply here

### 7.3 Goal-driven rendering
The `GoalList` component reads goals from `GET /digest-goals` and renders itself flat (no tier grouping):
```tsx
function GoalList({ goals }: { goals: DigestGoalConfig[] }) {
  return (
    <div>
      {goals.map(g => (
        <DigestGoalPicker key={g.goal} goal={g} />
      ))}
    </div>
  );
}
```

### 7.4 State management
Keep it simple — `useState` for now:
- `sourceHash: string | null` — current source
- `digestGoals: DigestGoalConfig[]` — loaded from `/digest-goals`
- `digests: Digest[]` — list of generated digests (each with a `DigestBlock[]` output)
- `generating: Record<string, boolean>` — which digest goals are in-flight

---

## Step 8: Dogfood End-to-End

### 8.1 Run through the full path with real URLs
Pick 3-5 of your own bookmarks across types:
1. **Technical article** (e.g., a React/AWS blog post)
2. **Long-form essay** (e.g., a Substack or personal blog post)
3. **Tutorial / how-to** (e.g., MDN docs, FreeCodeCamp)
4. **Video** (optional — tests video extraction path)

### 8.2 For each URL, verify:
- [ ] `POST /sources` succeeds → returns `sourceHash`
- [ ] `GET /sources/{sourceHash}` returns content with `status: 'ready'`
- [ ] Embedding exists (`embedding` array is populated)
- [ ] `GET /digest-goals` returns the `DIGEST_GOALS` definitions
- [ ] For each selected digest goal: `POST /digests` → `GET /digests/{digestId}` returns a `DigestBlock[]` output that validates against `digestBlockSchema` and renders correctly through the block registry
- [ ] Output is useful, not garbage — subjective quality check
- [ ] Error handling: submit an invalid URL → 400; submit a failing URL (404 site) → clean error

### 8.3 Things to look for (digest-goal shape rough edges)
- Are the modifier options actually useful? Or do you want to add/remove options?
- Is the `paramsVersion` / catalog-package-version tracking clear enough to reproduce a past digest?
- Do the prompt templates + `allowedBlockTypes` restrictions produce consistently good, well-typed output?
- Are the `allowedBlockTypes` choices per goal (Step 5.2) right, or does a goal need access to different blocks?
- Is the goal picker UI intuitive without tier grouping?
- Are there missing digest goals you keep wanting?

### 8.4 Outputs to save
- Save the list of dogfooded URLs + results to `plans/dogfood-results.md`
- Record any catalog schema changes needed in `plans/catalog-iterations.md`
- Update Phase-1 plan with any discoveries

---

## Dependency Graph (execution order)

```
Step 2 (Postgres CDK)
  └→ Step 3 (Schema DDL + Zod)  ← depends on Postgres being up
  └→ Step 6 (API routing)       ← depends on Step 2 (SGs, Lambda configs)
    └→ Step 4 (Ingest Lambda)   ← depends on Step 2 + 3 (DB connection)
      └→ Step 5 (Digest Lambda) ← depends on Step 3 + 4 (source data exists)
        └→ Step 7 (Frontend)    ← depends on Step 6 (API endpoints exist)
          └→ Step 8 (Dogfood)   ← depends on everything above
```

**Parallelizable:** Steps 2 and 3 can partially overlap (write Zod schemas while DB is provisioning). Steps 4 (ingest) and 5 (digest) can be coded in parallel since they share the same DB helper and schema types.

---

## Estimated effort

| Step | Effort | Notes |
|------|--------|-------|
| 2. Postgres + pgvector | 1-2 hours | CDK infra + VPC + Aurora + connectivity |
| 3. Schema + Zod | 2-3 hours | DDL, Zod types, SQL migration run |
| 4. Ingestion pipeline | 3-4 hours | Firecrawl fetch, hash, dedup, upsert, Step Fns integration |
| 5. Digest generation | 2-3 hours | Bedrock + Vercel AI SDK, catalog-driven prompts |
| 6. API layer | 2-3 hours | Route wiring, Lambda IAM, new endpoints |
| 7. Branch-tree UI | 2-3 hours | Catalog-driven rendering, digest results |
| 8. Dogfood | 1-2 hours | Running real URLs, documenting findings |
| **Total** | **~13-20 hours** | Across 2-3 focused sessions |
