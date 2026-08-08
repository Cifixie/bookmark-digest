# Phase-1 Execution Plan

**Goal:** Wire Postgres + pgvector into the CDK stack, build out the core data pipeline (ingest → embed → digest), expose API endpoints, and dogfood end-to-end.

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
  digest_type     text NOT NULL,               -- 'summary', 'tl_dr', 'notes', ...
  modifiers       jsonb DEFAULT '{}',          -- catalog-driven params (e.g., {tone: 'casual', length: 'short'})
  params_version  text NOT NULL,               -- which catalog version produced this digest
  status          text NOT NULL DEFAULT 'pending',-- 'pending', 'generating', 'done', 'failed'
  output          text,                         -- the generated digest text
  error           text,
  model           text,                        -- 'anthropic.claude-sonnet-v4:0', ...
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX idx_digests_source ON digests (source_hash);
CREATE INDEX idx_digests_type ON digests (digest_type);
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

export const digestTypeSchema = z.enum(["summary", "tl_dr", "notes", "action_items", "key_points"]);
export type DigestType = z.infer<typeof digestTypeSchema>;

export const digestSchema = z.object({
  id: z.string(),
  sourceHash: z.string(),
  digestType: digestTypeSchema,
  modifiers: z.record(z.string(), z.any()).default({}),
  paramsVersion: z.string(),
  status: digestStatus,
  output: z.string().nullable(),
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

// List available digest types (from catalog)
export const listDigestTypesResponseSchema = z.object({
  types: z.array(z.object({
    type: z.string(),
    label: z.string(),
    description: z.string(),
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
  digestType: digestTypeSchema,
  modifiers: z.record(z.string(), z.any()).optional().default({}),
});

export const requestDigestResponseSchema = z.object({
  digestId: z.string(),
  status: z.literal("accepted"),
});

// Fetch digest result
export const fetchDigestResponseSchema = z.object({
  id: z.string(),
  digestType: z.string(),
  modifiers: z.record(z.string(), z.any()),
  status: digestStatus,
  output: z.string().nullable(),
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
1. Receive `POST /digests` with `{ sourceHash, digestType, modifiers }`
2. Validate with `requestDigestRequestSchema`
3. **Prompt assembly** (catalog-driven):
   - Lookup `digestType` in catalog for system prompt template + expected modifiers
   - Fetch Source row (content)
   - Template: ``system: "You are a digest assistant. Type: {digestType}. Modifiers: {modifiers}.\n\nContent:\n{content}"``
4. Call Bedrock via Vercel AI SDK:
   ```ts
   import { anthropic } from "@ai-sdk/anthropic";
   const { textStream } = streamText({
     model: anthropic("anthropic.claude-sonnet-v4-0"),
     system: assembledPrompt,
     maxTokens: 2048,
   });
   ```
5. Collect stream → save to `digests.output`
6. Update digest row: `status = 'done', model = 'anthropic.claude-sonnet-v4-0', completed_at = now()`
7. Return `{ digestId, status: 'done' }`

### 5.2 Catalog package (`packages/catalog/src/index.ts`)
The `defineCatalog` schema that drives digest types and modifiers:

```ts
import { z } from "zod";

const digestTypeSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  systemPrompt: z.string(),          // template string with {modifiers} interpolation
  expectedOutputLength: z.enum(["short", "medium", "long"]).default("medium"),
  modifiers: z.array(z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    options: z.array(z.string()),
    default: z.string().optional(),
  })),
  tier: z.enum(["1", "2"]),          // 1 = Structure, 2 = Digest Essentials
});

export const catalogSchema = z.object({
  version: z.string(),
  digestTypes: z.array(digestTypeSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

// Tier 1: Structure
const TIER_1_TYPES = [
  {
    type: "summary",
    label: "Summary",
    description: "A concise prose summary of the source content.",
    systemPrompt: "Provide a concise summary of the following content. Keep it under 200 words.",
    modifiers: [],
    tier: "1" as const,
  },
  {
    type: "tl_dr",
    label: "TL;DR",
    description: "Ultra-short bullet-point summary.",
    systemPrompt: "Give a TL;DR — 3-5 bullet points capturing the core message.",
    modifiers: [],
    tier: "1" as const,
  },
  // ... more Tier 1
];

// Tier 2: Digest Essentials
const TIER_2_TYPES = [
  {
    type: "notes",
    label: "Notes",
    description: "Structured notes from the content.",
    systemPrompt: "Extract structured notes from the following content.",
    modifiers: [
      { key: "format", label: "Format", description: "Output format for notes", options: ["bullet", "paragraph", "markdown"], default: "bullet" },
      { key: "detail", label: "Detail level", options: ["brief", "comprehensive"], default: "comprehensive" },
    ],
    tier: "2" as const,
  },
  // ... more Tier 2
];

export function defineCatalog(tier?: "1" | "2"): Catalog {
  const types = tier
    ? [...TIER_1_TYPES, ...TIER_2_TYPES].filter(t => t.tier === tier)
    : [...TIER_1_TYPES, ...TIER_2_TYPES];
  return { version: "0.1.0", digestTypes: types };
}
```

---

## Step 6: API Layer (Extended Endpoints)

### 6.1 New routes on existing API Gateway

| Method | Path | Authorizer | Handler | Description |
|--------|------|------------|---------|-------------|
| `POST` | `/sources` | Cognito | `ingest-url` | Submit URL for ingestion (dedup + fetch) |
| `GET`  | `/sources/{sourceHash}` | Cognito | Lambda Proxy | Fetch a Source (with optional embedding) |
| `GET`  | `/catalog` | None* | Static | Return catalog JSON |
| `POST` | `/digests` | Cognito | `generate-digest` | Request a digest for a source |
| `GET`  | `/digests/{digestId}` | Cognito | Lambda Proxy | Fetch a digest result |
| `GET`  | `/digests?sourceHash=...` | Cognito | Lambda Proxy | List digests for a source |

*\*Catalog endpoint can be public or Cognito-authorized; public is simpler since it's just type definitions.*

### 6.2 Route adders in `bookmark-digest-stack.ts`

```ts
// New resources
const sources = api.root.addResource("sources");
const sourceHash = sources.addResource("{sourceHash}");
const digests = api.root.addResource("digests");
const digestId = digests.addResource("{digestId}");

// GET /catalog (no authorizer)
digests.addMethod("GET", new apigw.LambdaIntegration(catalogFn, { proxy: true }), {
  // No authorizer - catalog is just type definitions
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
Target state: **Submit URL → show source → show digest-type branch tree → select digests → show results.**

```
[Submit URL]
    ↓
Source status: "fetched" → Source loaded
    ↓
┌─ Digest Options (from catalog GET /catalog) ─┐
│  ☐ Summary        [Generate]                 │
│  ☐ TL;DR          [Generate]                 │
│  ☐ Notes          [Generate]                  │
│     format: [bullet ▼]  detail: [comprehensive ▼]│
│  ☐ Action Items   [Generate]                 │
└──────────────────────────────────────────────┘
    ↓ (after generating)
┌─ Digest Results ─┐
│ Summary: "..."   │
│ TL;DR: "..."     │
│ Notes: { bullets }│
└──────────────────┘
```

### 7.2 Components to add

1. **`@/components/SourceCard`** — Displays source info + status
2. **`@/components/DigestBranch`** — Catalog-driven UI for selecting digest types + modifiers
   - Renders `digestType.label` + `digestType.description`
   - For each modifier in the catalog, renders a selector (dropdown for enum, text input for freeform)
3. **`@/components/DigestResult`** — Displays a single digest output
4. **`@/components/BranchTree`** — Grouped digest options by tier (Structure / Digest Essentials)

### 7.3 Catalog-driven rendering
The `BranchTree` component reads the catalog from `GET /catalog` and renders itself:
```tsx
function BranchTree({ catalog }: { catalog: Catalog }) {
  const tierGroups = groupBy(catalog.digestTypes, t => t.tier);
  return (
    <div>
      <h3>Tier 1: Structure</h3>
      {tierGroups["1"]?.map(t => (
        <DigestBranch key={t.type} type={t} />
      ))}
      <h3>Tier 2: Digest Essentials</h3>
      {tierGroups["2"]?.map(t => (
        <DigestBranch key={t.type} type={t} />
      ))}
    </div>
  );
}
```

### 7.4 State management
Keep it simple — `useState` for now:
- `sourceHash: string | null` — current source
- `catalog: Catalog | null` — loaded from `/catalog`
- `digests: Digest[]` — list of generated digests
- `generating: Record<string, boolean>` — which digest types are in-flight

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
- [ ] `GET /catalog` returns the digest type definitions
- [ ] For each selected digest type: `POST /digests` → `GET /digests/{digestId}` returns the output
- [ ] Output is useful, not garbage — subjective quality check
- [ ] Error handling: submit an invalid URL → 400; submit a failing URL (404 site) → clean error

### 8.3 Things to look for (catalog shape rough edges)
- Are the modifier options actually useful? Or do you want to add/remove options?
- Is the catalog versioning mechanism clear?
- Do the prompt templates produce consistently good output?
- Should any Tier 1/2 types be promoted/demoted?
- Is the BranchTree rendering intuitive?
- Are there missing digest types you keep wanting?

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
