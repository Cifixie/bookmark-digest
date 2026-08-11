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

### Step 4: DynamoDB K-NN vector search (commits `95840c7`, CDK wiring below)
- `sourcesKnnQuery()` in `dynamo.ts` — raw DynamoDB client with `KnnConfig`
- `related-sources` Lambda: K-NN first, brute-force fallback
- **CDK stack**: `SourcesTable` is now a `CfnTable` (Option A from the original
  handoff draft) with `EmbeddingVectorIndex` GSI. Since `VectorIndexConfiguration`
  isn't in CDK v2.263.0's `GlobalSecondaryIndexProperty` type (and, worse, gets
  silently stripped by the generated L1 property renderer if just typed past
  with `as any` in the props object), it's added post-construction via
  `sourcesTableCfn.addPropertyOverride("GlobalSecondaryIndexes.1.VectorIndexConfiguration", {...})`
  — the standard CDK escape hatch that writes straight into the synthesized
  template, bypassing the renderer. Confirmed present in `cdk synth` output.
  `cdk synth` also emits two template-validation *warnings* (not errors) for
  `VectorIndexConfiguration` and the `embedding` attribute's `L` type, since
  the local CFN schema doesn't recognize this preview feature yet — expected,
  not a blocker.
- All `sourcesTable.grant*Data(fn)` calls replaced with `grantSourcesTableRead`/
  `grantSourcesTableReadWrite` helpers (local to the stack file) that add
  direct IAM policy statements on `${tableArn}` + `${tableArn}/index/*`, since
  `CfnTable` doesn't implement `ITable`.
- The DynamoDB Streams trigger (`embedSourceFn`) also needed rewiring: `CfnTable`
  can't be passed to `lambdaEventSources.DynamoEventSource` (needs `ITable`), so
  it's now a plain `lambda.EventSourceMapping` against `sourcesTableCfn.attrStreamArn`,
  with the stream-read IAM actions added manually.

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
1. **CDK types missing `vectorIndexConfiguration`** — resolved via `addPropertyOverride` (see Step 4 above), not a type cast — casts on the props object get dropped by the L1 renderer before synth.
2. **CfnTable doesn't implement ITable** — resolved via local `grantSourcesTableRead`/`grantSourcesTableReadWrite` helpers using direct IAM statements.
3. **Embedding attribute not declared on CfnTable** — resolved: `{ attributeName: "embedding", attributeType: "L" }` added to `attributeDefinitions`.
4. **DynamoDB Streams trigger used `lambdaEventSources.DynamoEventSource(sourcesTable, ...)`** — that construct requires `ITable`, which `CfnTable` doesn't implement. Resolved via `lambda.EventSourceMapping` targeting `sourcesTableCfn.attrStreamArn` directly.

## Key Files
- `apps/infra/lib/bookmark-digest-stack.ts` — CDK stack (`SourcesTable` is now `CfnTable`)
- `apps/infra/lib/dynamo.ts` — K-NN query function ready
- `apps/infra/lambdas/related-sources/handler.ts` — K-NN first, brute-force fallback
- `apps/infra/lib/similarity.ts` — brute-force cosine similarity (kept as fallback)
- `apps/web/src/app/page.tsx` — multi-source picker with goal dropdown
