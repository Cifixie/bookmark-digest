# Phase 2 Handoff — Multi-source digests

**Status: complete.** Step 4 (CDK vector index) finished — see below.

## Completed

### Step 1: Multi-source backend + manual picker (commit `e43e914`)
- `POST /digests` accepts `sourceHashes[]` alongside legacy `sourceHash`
- Worker fetches all sources, combines into prompt with source attribution
- Dedup compares full array for multi-source
- DynamoDB: added `sourceHashes` LCC, kept `sourceHash` (first element) for GSI
- `GET /sources` endpoint added (list-sources Lambda)
- Home page: multi-source "Compare / Synthesize" section with checkboxes, goal dropdown

### Step 2: ComparisonTable + AuthorCard blocks (commit `c028479`)
- **ComparisonTable**: props `columns[]`, `rows[]` (label + per-source values), `summary`, `winnerIndex?`
- **AuthorCard**: props `name`, `text`, `type?`, `url?`, `context?`
- Multi-source prompt updated to instruct model to use these blocks

### Step 3: TimelineEvent block (commit `69abfc4`)
- **TimelineEvent**: props `items[]` (date, label, text, sourceIndex?), `narrative?`
- Multi-source prompt updated to suggest TimelineEvent for evolution shape

### Step 4: DynamoDB vector search (commit `95840c7` + fixes below)
**Correction to the original handoff draft**: DynamoDB vector indexes are
**not** a GSI property. An earlier attempt modeled the `EmbeddingVectorIndex`
as a GSI with a `VectorIndexConfiguration` property (via `addPropertyOverride`,
to work around CDK's L1 types not knowing about it) — this synthesized fine
but was **rejected at deploy time** by CloudFormation's own change-set
validation: `Unsupported property [VectorIndexConfiguration]`. Confirmed
against `docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearch.html`:
vector indexes have no CloudFormation resource or GSI property at all — they're
managed exclusively through the `CreateTable`/`UpdateTable` SDK APIs
(`VectorIndexes` / `VectorIndexUpdates` params) and queried via the dedicated
`SearchVectors` API, not `Query`/`KnnConfig`.

Fixed:
- **CDK stack**: `SourcesTable` (`CfnTable`) now only declares the real
  `UrlIndex` GSI. The vector index is created by a separate
  `cr.AwsCustomResource` (`EmbeddingVectorIndexResource`) that calls
  `dynamodb:updateTable` directly with a `VectorIndexUpdates: [{ Create: {...} }]`
  payload matching the real API shape (`VectorAttribute`, `Dimensions`,
  `DistanceFunction: "COSINE"`, `SearchSchema` with `contentHash` as
  `INLINE_FILTER` so queries can exclude the source itself, `Projection`).
  `installLatestAwsSdk: true` is set explicitly — vector search is new enough
  that the Lambda runtime's bundled SDK may predate it. onCreate-only (no
  onUpdate): re-running `Create` against an existing index fails; changing
  vector-index config later needs an explicit `Delete` + `Create` wired up
  separately.
- **`dynamo.ts::sourcesKnnQuery`**: rewritten to call `SearchVectorsCommand`
  (`SearchVector`, `SearchConditionExpression`, `TopK`) instead of
  `QueryCommand` + `KnnConfig` (which doesn't exist). `SearchVectors` also
  returns a real similarity `Score` per result, so `related-sources/handler.ts`
  no longer needs to synthesize a placeholder `score: 0`.
- All `sourcesTable.grant*Data(fn)` calls replaced with `grantSourcesTableRead`/
  `grantSourcesTableReadWrite` helpers (local to the stack file) that add
  direct IAM policy statements on `${tableArn}` + `${tableArn}/index/*`, since
  `CfnTable` doesn't implement `ITable`. `relatedSourcesFn` additionally gets
  `dynamodb:SearchVectors`, which isn't in that standard read set.
- The DynamoDB Streams trigger (`embedSourceFn`) also needed rewiring: `CfnTable`
  can't be passed to `lambdaEventSources.DynamoEventSource` (needs `ITable`), so
  it's now a plain `lambda.EventSourceMapping` against `sourcesTableCfn.attrStreamArn`,
  with the stream-read IAM actions added manually.
- `cdk synth` is clean — no warnings, no errors.

### 5. Suggested-bundle UX (later)
Once vector search works, the "suggested bundle" flow from `phase-2-scope.md` can be built:
- After a user completes a multi-source digest, offer "generate related digests" for top-K related sources
- The `RelatedFromYourBookmarks` section (already wired in the frontend) will use the improved similarity signal

## Quick Start When Resuming

```bash
# Check current state
git log --oneline -5
# Expected: 95840c7 is latest (K-NN code committed)

# Verify clean
git status
# Should show bookmark-digest-stack.ts modified (CfnTable changes in progress)

# Typecheck
pnpm --filter infra typecheck
pnpm --filter web typecheck
pnpm --filter catalog test

# Synthesize
cd apps/infra && npx cdk synth
```

## Blockers (resolved)
1. **Vector indexes aren't a CloudFormation resource/GSI property at all** — the
   `VectorIndexConfiguration`-on-a-GSI approach passed `cdk synth` but was
   rejected by CloudFormation at deploy time. Resolved via `cr.AwsCustomResource`
   calling `dynamodb:updateTable` directly (see Step 4 above).
2. **CfnTable doesn't implement ITable** — resolved via local `grantSourcesTableRead`/`grantSourcesTableReadWrite` helpers using direct IAM statements.
3. **`sourcesKnnQuery` used `QueryCommand` + a `KnnConfig` parameter that doesn't exist** — resolved: rewritten against the real `SearchVectorsCommand`.
4. **DynamoDB Streams trigger used `lambdaEventSources.DynamoEventSource(sourcesTable, ...)`** — that construct requires `ITable`, which `CfnTable` doesn't implement. Resolved via `lambda.EventSourceMapping` targeting `sourcesTableCfn.attrStreamArn` directly.

## Key Files
- `apps/infra/lib/bookmark-digest-stack.ts` — CDK stack (`SourcesTable` is now `CfnTable`)
- `apps/infra/lib/dynamo.ts` — K-NN query function ready
- `apps/infra/lambdas/related-sources/handler.ts` — K-NN first, brute-force fallback
- `apps/infra/lib/similarity.ts` — brute-force cosine similarity (kept as fallback)
- `apps/web/src/app/page.tsx` — multi-source picker with goal dropdown
