# Phase 2 Handoff — Multi-source digests

**Last session:** Step 4 partially done (DynamoDB vector search code ready, CDK stack blocked on type definitions).

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

### Step 4 (partial): DynamoDB K-NN vector search (commit `95840c7`)
- `sourcesKnnQuery()` in `dynamo.ts` — raw DynamoDB client with `KnnConfig`
- `related-sources` Lambda: K-NN first, brute-force fallback
- **UNFINISHED**: CDK stack still uses `TableV2` — `EmbeddingVectorIndex` GSI with `VectorIndexConfiguration` not yet added (CDK v2.264.0 type definitions don't include `vectorIndexConfiguration` on `GlobalSecondaryIndexProperty`)

## Remaining Work

### 4a. Add EmbeddingVectorIndex GSI to CDK stack
The K-NN query code is ready (`dynamo.ts::sourcesKnnQuery`), but the GSI doesn't exist yet.

**Two approaches — pick one:**

#### Option A: Replace TableV2 with CfnTable (faster)
```typescript
const sourcesTableCfn = new cdk.aws_dynamodb.CfnTable(this, "SourcesTable", {
  tableName: "bookmark-digest-sources",
  keySchema: [{ attributeName: "contentHash", keyType: "HASH" }],
  attribute: [{ name: "contentHash", type: "S" }, { name: "url", type: "S" }],
  billingMode: "PAY_PER_REQUEST",
  globalSecondaryIndexes: [
    {
      indexName: "UrlIndex",
      keySchema: [{ attributeName: "url", keyType: "HASH" }],
      projection: { projectionType: "ALL" },
    },
    {
      indexName: "EmbeddingVectorIndex",
      keySchema: [
        { attributeName: "embedding", keyType: "HASH" },
        { attributeName: "contentHash", keyType: "RANGE" },
      ],
      projection: {
        projectionType: "INCLUDE",
        nonKeyAttributes: ["url", "status", "contentType", "fetchedAt"],
      },
      vectorIndexConfiguration: {
        name: "embeddingVectorIndexConfig",
        fieldPath: "embedding",
        knnL2Configuration: {
          dimension: 1024,  // or config.BEDROCK_EMBEDDING_DIMENSIONS
          numberOfVectorsPerDimension: 5000,
        },
      } as any,  // CDK v2.264.0 types don't include this yet
    },
  ],
  streamSpecification: { streamViewType: "NEW_IMAGE" },
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  deletionProtectionEnabled: true,
});
```
Then fix all `sourcesTable.grant*Data(fn)` calls → `fn.role?.addToPrincipalPolicy(...)` with direct IAM statements for `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:Scan`, etc. on `${tableArn}` and `${tableArn}/index/*`.

This is what was in the working tree before the handoff — several `s/.*sourcesTable.*/sourcesTableCfn/` substitutions already applied, grant helpers in `config.ts` were written but not wired up.

#### Option B: Keep TableV2, add GSI via CfnGlobalSecondaryIndex (wrong resource type)
`CfnGlobalSecondaryIndex` doesn't exist in CDK — it must be a GSI property on `CfnTable`. So Option A is the only viable path.

### 4b. Verify CDK synth + deploy
- Run `cdk synth` — should produce template with `AWS::DynamoDB::Table` containing `VectorIndexConfiguration` on the `EmbeddingVectorIndex` GSI
- Deploy and verify K-NN query works (or falls back gracefully)

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

## Blockers (from last session)
1. **CDK types missing `vectorIndexConfiguration`** — worked around with `as any` cast
2. **CfnTable doesn't implement ITable** — no `grantReadWriteData()` etc. — use direct IAM grants
3. **Embedding attribute not declared on CfnTable** — needs to be in `attribute` list (currently only `contentHash` and `url` are listed; `embedding` will be added at index creation time since it's in the GSI key schema)

## Key Files
- `apps/infra/lib/bookmark-digest-stack.ts` — CDK stack (modifying TableV2 → CfnTable)
- `apps/infra/lib/dynamo.ts` — K-NN query function ready
- `apps/infra/lambdas/related-sources/handler.ts` — K-NN first, brute-force fallback
- `apps/infra/lib/similarity.ts` — brute-force cosine similarity (kept as fallback)
- `apps/web/src/app/page.tsx` — multi-source picker with goal dropdown
