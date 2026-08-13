# Dropping Aurora for DynamoDB

**Context:** `plans/phase-1-execution.md` (Postgres + pgvector) and `plans/phase-1-fixes.md`
(deploy fixes) got the Aurora path fully wired, but the target AWS account is on
the **AWS Free Plan**, which only permits Aurora PostgreSQL via "express
configuration" — a creation mode CloudFormation doesn't support. That means CDK
cannot provision the cluster at all on this account; the workaround
(`apps/infra/db/PROVISION_AURORA_EXPRESS.md`) requires a manual, out-of-band CLI
provisioning step, a hand-created Postgres role for Data API auth, and a
DB-warmup Lambda to hide scale-to-zero cold starts. That's a lot of ceremony
for a personal-scale tool still in early development.

**Decision:** since the project is early enough to pivot cheaply, replace
Aurora/pgvector with **DynamoDB**. This removes the Free Plan blocker entirely
(DynamoDB has always had a permanent, generous free tier — 25GB storage +
25 RCU/WCU always-free, no account-plan restrictions), removes the VPC/Data
API/warmup machinery, and fits the serverless/Lambda architecture more
naturally (no connection management, no cold-start pause, no manual DDL
migration). The trade-off is losing pgvector's ANN index for semantic search —
addressed below with a brute-force approach that's more than adequate at
personal-bookmark scale.

**Goal of this plan:** fully replace the Postgres/RDS-Data-API layer with
DynamoDB across CDK, all 8 Lambdas, and remove everything that only existed to
support Aurora (manual provisioning doc, warmup ping, migrate-db custom
resource, SQL DDL).

---

## 1. Table design

Two on-demand (`PAY_PER_REQUEST`) DynamoDB tables — no capacity planning, no
idle billing at all (stricter than even Aurora's scale-to-zero, which still
has a 15-minute pause window before it stops billing compute).

### `Sources` table

| Attribute | Type | Role |
|---|---|---|
| `contentHash` | String | **Partition key** (matches the old `content_hash` PK) |
| `url` | String | attribute; also GSI partition key (dedup lookup) |
| `content` | String | extracted readable content |
| `contentType` | String | `article` \| `video` \| `unknown` |
| `fetchedAt` | String (ISO) | |
| `fetchedBy` | String | `firecrawl`, ... |
| `status` | String | `fetched` \| `embedding` \| `ready` \| `failed` |
| `embedding` | List\<Number\> | 1536-dim vector, populated after embedding |
| `embeddingModel` | String | |
| `embeddingAt` | String (ISO) | |

**GSI: `UrlIndex`** — PK `url`. Replaces the old `idx_sources_url` unique
index; used by `ingest-url` for the dedup check (`GET item where url = :url`).
DynamoDB GSIs aren't uniqueness-enforcing, so dedup logic reads the GSI result
and treats "found" as the existing record — matches the current Lambda logic,
which already treats dedup as a query-then-branch, not a DB-level constraint.

### `Digests` table

| Attribute | Type | Role |
|---|---|---|
| `id` | String (UUID) | **Partition key** |
| `sourceHash` | String | attribute; also GSI partition key |
| `digestGoal` | String | attribute; also GSI sort key |
| `modifiers` | Map | goal-specific params |
| `paramsVersion` | String | |
| `status` | String | `pending` \| `generating` \| `done` \| `failed` |
| `output` | List\<Map\> | `DigestBlock[]`, validated against `digestBlockSchema` |
| `error` | String | |
| `model` | String | |
| `createdAt` | String (ISO) | |
| `updatedAt` | String (ISO) | |
| `completedAt` | String (ISO) | |

**GSI: `SourceHashIndex`** — PK `sourceHash`, SK `digestGoal`. Serves two
purposes that used to require separate SQL queries/indexes:
- The existing-pending-digest dedup check in `generate-digest`
  (`Query SourceHashIndex where sourceHash = :sh AND digestGoal = :dg`, then
  filter results client-side for `status IN (pending, generating)` — cheap at
  the item counts involved).
- **Closes out the previously-deferred `GET /digests?sourceHash=...` list
  route** (`plans/phase-1-fixes.md` C.5) for free — it's just
  `Query SourceHashIndex where sourceHash = :sh`, no separate Lambda or SQL
  needed.

---

## 2. Semantic search without pgvector

`RelatedFromYourBookmarks` (per `CLAUDE.md`, a non-catalog section fed by
pgvector retrieval) needs a replacement retrieval strategy:

- **Approach:** brute-force cosine similarity, computed in Lambda.
  `Scan` the `Sources` table (filtering `status = ready`), compute cosine
  similarity between the query embedding and each item's `embedding`
  attribute in application code, sort, take top-K.
- **Why this is fine here:** at personal-bookmark scale (dozens to low
  thousands of sources), a full scan is fast and cheap — DynamoDB on-demand
  charges per read, and a scan over that many small items is trivial cost.
  This avoids standing up OpenSearch Serverless (real ANN, but real
  operational cost/complexity — not justified at this scale).
- **Revisit trigger:** if the source count grows into the tens of thousands
  and scan latency/cost becomes noticeable, that's the point to introduce
  a real vector index (OpenSearch Serverless vector engine, or Pinecone/etc.)
  — not before.

---

## 3. Ingest → embed trigger: DynamoDB Streams instead of direct Lambda invoke

The Aurora-era design had `ingest-url` directly invoke `embed-source` via
`lambda:InvokeFunction` — this is exactly where the reversed-`grantInvoke`
bug happened (see `plans/phase-1-fixes.md` B.1). DynamoDB offers a cleaner,
fully-managed alternative:

- Enable a **DynamoDB Stream** on the `Sources` table (`NEW_IMAGE` view type).
- Add `embed-source` as a Lambda **event source mapping** on that stream,
  filtered to `INSERT` events (or `MODIFY` events where `status` transitions
  to `embedding`, via a stream filter).
- `ingest-url` no longer needs to know about `embed-source` at all — no
  `EMBED_SOURCE_FUNCTION_NAME` env var, no invoke IAM grant, no risk of the
  grant-direction bug class recurring. AWS manages retries/batching on the
  stream automatically.

This is a strict simplification: one less cross-Lambda coupling, one less
manual IAM grant to get right, automatic retry semantics instead of a
fire-and-forget `Event` invoke wrapped in a swallowed try/catch.

---

## 4. CDK changes (`apps/infra/lib/bookmark-digest-stack.ts`)

### Remove
- `secretsmanager.Secret.fromSecretCompleteArn` (`DbSecret`) and the
  `auroraClusterArn`/`auroraSecretArn` context-value requirement + the
  `throw new Error(...)` guard for missing context.
- `migrateDbFn` (`lambdas/migrate-db/`) and the `ApplyMigration`
  `cr.AwsCustomResource` — DynamoDB tables are declared directly as CDK
  resources (`dynamodb.TableV2`); there's no DDL/migration step to run.
- `warmupFn` (`lambdas/warmup/`) and the `GET /warmup` route — DynamoDB
  on-demand tables have no cold-start/resume latency to hide.
- All `rds-data:*` IAM policy statements and `dbSecret.grantRead(fn)` calls
  across every Lambda.
- `apps/infra/db/PROVISION_AURORA_EXPRESS.md` and
  `apps/infra/db/migrations/001_sources_digests.sql` — no manual provisioning
  step, no SQL DDL.

### Add
```ts
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";

const sourcesTable = new dynamodb.TableV2(this, "SourcesTable", {
  partitionKey: { name: "contentHash", type: dynamodb.AttributeType.STRING },
  billing: dynamodb.Billing.onDemand(),
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
});
sourcesTable.addGlobalSecondaryIndex({
  indexName: "UrlIndex",
  partitionKey: { name: "url", type: dynamodb.AttributeType.STRING },
});

const digestsTable = new dynamodb.TableV2(this, "DigestsTable", {
  partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
  billing: dynamodb.Billing.onDemand(),
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
digestsTable.addGlobalSecondaryIndex({
  indexName: "SourceHashIndex",
  partitionKey: { name: "sourceHash", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "digestGoal", type: dynamodb.AttributeType.STRING },
});
```

- Per-Lambda `environment`: replace `DATABASE_SECRET_ARN` /
  `DATABASE_RESOURCE_ARN` / `DATABASE_NAME` with `SOURCES_TABLE_NAME`
  and/or `DIGESTS_TABLE_NAME` as applicable.
- Per-Lambda IAM: replace the hand-written `rds-data:*` policy statements
  with `sourcesTable.grantReadWriteData(fn)` / `digestsTable.grantReadWriteData(fn)`
  (or `grantReadData`/`grantWriteData` where a Lambda is read- or write-only,
  e.g. `fetch-source`/`fetch-digest` only need `grantReadData`).
- Wire the stream trigger:
  ```ts
  embedSourceFn.addEventSource(new lambdaEventSources.DynamoEventSource(sourcesTable, {
    startingPosition: lambda.StartingPosition.LATEST,
    filters: [lambda.FilterCriteria.filter({ eventName: lambda.FilterRule.isEqual("INSERT") })],
  }));
  ```

---

## 5. Per-Lambda migration checklist

All 5 data-touching Lambdas currently share the same shape: a hand-rolled
`rdsExecute()` helper built on `@aws-sdk/client-rds-data`. Each becomes a
`@aws-sdk/lib-dynamodb` (`DynamoDBDocumentClient`) call. This is also the
natural point to finally extract the previously-deferred shared helper
(`plans/phase-1-fixes.md` C.3) — as `apps/infra/lib/dynamo.ts` — since a
DynamoDB doc-client wrapper is genuinely reusable across all 5 Lambdas in a
way the ARN-parameterized RDS helper never quite was.

| Lambda | Old (RDS Data API) | New (DynamoDB) |
|---|---|---|
| `ingest-url` | `SELECT ... WHERE url = $1` dedup, `INSERT ... ON CONFLICT DO NOTHING` | `Query` on `UrlIndex`; `PutCommand` with `ConditionExpression: attribute_not_exists(contentHash)` for idempotent insert, catch `ConditionalCheckFailedException` to detect "already existed" |
| `embed-source` | Triggered via direct Lambda invoke; `UPDATE sources SET embedding = ...` in a transaction | Triggered via **DynamoDB Stream** (§3); `UpdateCommand` on the changed item (no explicit transaction needed — single-item update) |
| `generate-digest` | Dedup `SELECT`, `INSERT` pending row, `SELECT content`, `UPDATE` on completion/failure | `Query` on `SourceHashIndex` for dedup, `PutCommand` for the pending row, `GetCommand` for source content, `UpdateCommand` on completion/failure |
| `fetch-source` | `SELECT * WHERE content_hash = $1` | `GetCommand` by `contentHash` |
| `fetch-digest` | `SELECT * WHERE id = $1` | `GetCommand` by `id`; **add** the sourceHash-list branch via `Query` on `SourceHashIndex` (closes C.5, see §1) |
| `digest-goals` | N/A (static config) | Unchanged |
| `migrate-db` | Ran DDL | **Deleted** — no longer needed |
| `warmup` | Pinged Aurora to resume from pause | **Deleted** — no longer needed |

---

## 6. Package/dependency changes

`apps/infra/package.json`:
- Remove: `@aws-sdk/client-rds-data`, `@aws-sdk/client-lambda` (only used for
  the `embed-source` invoke from `ingest-url`, which goes away with the
  Streams trigger).
- Add: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`.

---

## 7. Schema package impact (`packages/schemas/src/index.ts`)

Minimal — `sourceSchema` / `digestSchema` / the API request/response schemas
are all storage-agnostic Zod shapes and don't change field-by-field. The only
review item: confirm `embedding: z.array(z.number()).nullable()` still
matches DynamoDB's `List<Number>` representation as returned by the
`lib-dynamodb` document client (it does — the document client marshals/
unmarshals native JS arrays/numbers automatically, unlike the raw
`client-dynamodb` which uses `AttributeValue` wrappers).

---

## 8. Docs to retire/update

- `apps/infra/db/PROVISION_AURORA_EXPRESS.md` — delete (no manual
  provisioning step exists for DynamoDB; tables are fully CDK-managed).
- `apps/infra/db/migrations/001_sources_digests.sql` — delete (no SQL DDL).
- `plans/phase-1-execution.md` Step 2 (Postgres provisioning), Step 3.1–3.2
  (DDL), Step 4.3 (`db.ts` RDS helper) — mark superseded by this plan, point
  readers here.
- `plans/phase-1-fixes.md` — mark Aurora-specific items (A.1–A.5, most of
  Phase C) as moot/superseded rather than editing them in place, so the
  history of what was fixed under the old architecture stays legible.

---

## Summary checklist

- [x] CDK: add `SourcesTable` + `DigestsTable` (`dynamodb.TableV2`, on-demand, GSIs)
- [x] CDK: wire `embed-source` as a DynamoDB Stream consumer on `SourcesTable`
- [x] CDK: remove Aurora/VPC/Secret/migrate-db/warmup resources and the `auroraClusterArn`/`auroraSecretArn` context requirement
- [x] `apps/infra/lib/dynamo.ts`: shared DynamoDB doc-client helper (get/put/update/query)
- [x] `ingest-url`: dedup via `UrlIndex` query, conditional put
- [x] `embed-source`: switch from direct-invoke handler to stream-event handler
- [x] `generate-digest`: dedup via `SourceHashIndex` query, get/put/update via doc client
- [x] `fetch-source`: `GetCommand` by `contentHash`
- [x] `fetch-digest`: `GetCommand` by `id` + new `Query`-based list-by-sourceHash branch
- [x] Delete `lambdas/migrate-db/`, `lambdas/warmup/`
- [x] Delete `apps/infra/db/PROVISION_AURORA_EXPRESS.md`, `apps/infra/db/migrations/`
- [x] `apps/infra/package.json`: swap RDS/Lambda-invoke SDK deps for DynamoDB SDK deps
- [x] Update `plans/phase-1-execution.md` and `plans/phase-1-fixes.md` to point here for the storage layer
- [ ] `cdk synth` / `cdk deploy` succeed with zero manual provisioning steps
- [ ] Dogfood end-to-end (per original plan Step 8), including a `RelatedFromYourBookmarks` sanity check on the brute-force similarity search
