# Phase 2 Handoff — Multi-source digests

**Status: complete.** Steps 1-3 shipped as designed. Step 4 (DynamoDB native
vector search) was built, found to be broken, and deliberately reverted — see
"Step 4: reverted" below before re-attempting it.

## Completed

### Step 1: Multi-source backend + manual picker (commit `e43e914`)
- `POST /digests` accepts `sourceHashes[]` alongside legacy `sourceHash`
- Worker fetches all sources, combines into prompt with source attribution
- DynamoDB: added `sourceHashes` to digest rows, kept `sourceHash` (first
  element) for the `SourceHashIndex` GSI
- `GET /sources` endpoint added (list-sources Lambda)
- Home page: multi-source "Compare / Synthesize" section with checkboxes, goal dropdown

Hardening applied after review:
- `sourceHashes` is validated as non-empty strings, **deduplicated and sorted**
  before use. The stored `sourceHash` is `hashes[0]`, which is the GSI key the
  dedup check looks up by — without normalizing, {A,B} and {B,A} were different
  bundles and generated twice.
- `MAX_SOURCES_PER_DIGEST` (8) and `MAX_SOURCE_CHARS_MULTI` (60k chars/source)
  in `lib/config.ts` bound the prompt. Previously "Select all" would concatenate
  the entire corpus into one request. The web picker mirrors the source cap so
  the user gets a disabled button rather than a 400.
- `GET /sources` projects only the picker's fields and reports `embedded:
  boolean` instead of the raw vector. It used to ship every source's full
  embedding to the browser.

### Step 1b: Source modes — the axis multi-source was missing

First real multi-source digest exposed the design gap: two articles by the same
author on the same subject came out framed as a versus (`ComparisonTable` +
`ProsCons`), because the multi-source prompt asserted "Compare, contrast" for
every bundle regardless of how the sources actually related. Comparison is a
category error for complementary sources, and per-source attribution is noise
when the author is the same.

Compounding it: the comparison instruction lived in the *user* turn while the
goal template ("Let **the article's** structure drive the page structure",
singular) was the *system* prompt, so the two fought over page shape.

Fixed by splitting shape from depth into two axes — see the "Digest Generation:
Two Independent Axes" section in `CLAUDE.md`. `sourceMode` (`synthesize` default
/ `compare` / `evolution`) is user-selected in the picker, served from
`GET /digest-goals` alongside the goals, stored on the digest row, and folded
into the dedup key so the same bundle can hold both a synthesis and a
comparison. All composition guidance moved into the system prompt.

Note `sourceMode` is deliberately *not* inferred from the sources. Source count
doesn't imply relationship, and inferring it is the same judgment call that
produced the wrong shape in the first place.

### Step 2: ComparisonTable + AuthorCard blocks (commit `c028479`)
- **ComparisonTable**: props `columns[]`, `rows[]` (label + per-source values), `summary`, `winnerIndex?`
- **AuthorCard**: props `name`, `text`, `type?`, `url?`, `context?`
- Multi-source prompt updated to instruct model to use these blocks

### Step 3: TimelineEvent block (commit `69abfc4`)
- **TimelineEvent**: props `items[]` (date, label, text, sourceIndex?), `narrative?`
- Multi-source prompt updated to suggest TimelineEvent for evolution shape

All three now have renderers under `apps/web/src/components/digestBlocks/` and
are registered in `apps/web/src/lib/registry.tsx`. They were registered in the
catalog and pushed into the prompt for three commits *without* renderers, which
nothing caught — `registry.tsx` now throws at module load if a catalog block
type has no component.

### Step 4: reverted — DynamoDB native vector search

Built across `95840c7` / `ab2e4e6` / `d395642`, then reverted. **Read this
before trying again**, because each of these was only found by checking the API
docs, not by anything in CI:

1. **`SearchConditionExpression` supports `=` only.** The implementation
   filtered `contentHash <> :exclude` to skip the query source itself.
   `<>`, `<`, `<=`, `>`, `>=` and `IN` are explicitly not available
   ([docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearchWorkingWith.html)).
   Every `SearchVectors` call raised `ValidationException`. Exclude the query
   source client-side with `TopK: k + 1` instead.
2. **The failure was invisible.** `related-sources` wrapped the call in
   `catch {}` and fell back to brute force, logging a message without the error.
   The feature was 100% dead and every response still looked correct.
3. **Score semantics are inverted vs. the brute-force path.** With `COSINE` (or
   `EUCLIDEAN`), *lower* `Score` means more similar. `lib/similarity.ts` returns
   cosine *similarity* and sorts descending. Same `score` field, opposite
   meaning. If re-attempted: either normalize, or use `DOT_PRODUCT` over
   normalized embeddings so higher is better on both paths.
4. **`Projection` listed `contentHash`** — a table key attribute, and already a
   `SearchSchema` element — in `NonKeyAttributes`. The non-key projection budget
   is shared with the vector attribute and each `INLINE_FILTER` element.
5. **No wait for backfill.** `SearchVectors` errors while the index is
   backfilling, and there is no `BACKFILLING` index status — you must poll
   `DescribeTable` for `IndexStatus == ACTIVE && Backfilling == false`. The
   `AwsCustomResource` returned as soon as `UpdateTable` was accepted, so
   CloudFormation reported success on an unusable index.
6. **`Dimensions` is fixed at index creation, and mismatched vectors are
   rejected on write to the base table.** With an onCreate-only custom
   resource, changing `BEDROCK_EMBEDDING_DIMENSIONS` would have broken
   ingestion with no in-stack way to fix it.

The `CfnTable` migration that came with it was also unnecessary. It existed so
the vector index could be attached via `addPropertyOverride`; once the index
moved to a custom resource, `TableV2`'s `tableName`/`tableArn` tokens were
perfectly usable, but the `CfnTable` stayed — dragging in hand-rolled IAM grant
helpers and a raw `EventSourceMapping` because `CfnTable` doesn't implement
`ITable`. Worse, it changed the table's logical ID from `SourcesTable1DBF2A17`
to `SourcesTable`, so deploying would have created an empty table and orphaned
the live one. It was never deployed, so nothing was lost.

**Decision: brute-force cosine similarity stays.** At personal-bookmark scale
(7 sources today; fine into the thousands) a full scan costs less than the
operational surface of a vector index that CloudFormation can't model. The two
real improvements from that work were kept: `SourcesTable` now has PITR and
deletion protection, and `sourcesScan` paginates through `LastEvaluatedKey`
instead of silently returning only the first 1 MB page.

Revisit the vector index when a scan actually hurts, and start from the six
points above.

### Step 5: Suggested-bundle UX (later)
The "suggested bundle" flow from `phase-2-scope.md` is unblocked — related
sources work today via brute force:
- After a user completes a multi-source digest, offer "generate related digests" for top-K related sources
- The `RelatedFromYourBookmarks` section (already wired in the frontend) uses the similarity signal

## Known gaps going into Phase 3

- `DigestMeta.subject` / `tags` exist in the schema but nothing produces them:
  `digestMetaSchema` is not part of `catalog.prompt()` and is not run by
  `validateDigestSpec`, so no generated digest carries either field. `subject`
  is `.optional()` for now. Phase 3 needs a producer **and** a backfill for
  existing digests before browse facets can filter on it.
- `list-sources` and `related-sources` both scan the whole table. Correct now,
  but it's the first thing to feel a growing corpus.

## Verify

```bash
pnpm --filter infra typecheck
pnpm --filter web typecheck
pnpm --filter catalog test
cd apps/infra && npx cdk diff   # SourcesTable must be [~] modify, never [-]/[+]
```

`cdk diff` is the important one for any change touching the tables: a
replacement on `SourcesTable1DBF2A17` means data loss.

## Key Files
- `apps/infra/lib/bookmark-digest-stack.ts` — CDK stack (`SourcesTable` is `TableV2`)
- `apps/infra/lib/dynamo.ts` — table helpers; `sourcesScan` paginates
- `apps/infra/lib/similarity.ts` — brute-force cosine similarity
- `apps/infra/lambdas/related-sources/handler.ts` — similarity ranking endpoint
- `apps/infra/lib/config.ts` — `MAX_SOURCES_PER_DIGEST`, `MAX_SOURCE_CHARS_MULTI`
- `apps/web/src/lib/registry.tsx` — block-type → renderer map (+ exhaustiveness guard)
- `apps/web/src/app/page.tsx` — multi-source picker with goal dropdown
