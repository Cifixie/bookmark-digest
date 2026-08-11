# Phase-3: Browse (Sources + Digests) with search

**Context:** assumes phase-2 (`plans/phase-2-scope.md`, `plans/phase-2-handoff.md`)
is complete — multi-source digest generation, `ComparisonTable`/`AuthorCard`/
`TimelineEvent` blocks, and the `RelatedFromYourBookmarks` native-vector-search
upgrade have all shipped. This is the step right before "Explore this"
(phase-4): you need a usable way to browse what you already have before an
agent starts adding more of it.

**Phase-2 status as of this writing:** multi-source backend, the three new
blocks, and the K-NN query code (`dynamo.ts::sourcesKnnQuery`,
`related-sources` Lambda with brute-force fallback) are done. The
`SourcesTable` CDK migration (`TableV2` → `CfnTable`, needed for the
`EmbeddingVectorIndex` GSI) is still in progress — see Prerequisite below
before this ships.

## What we actually have to filter/search on today

Audited against the live schema, not assumptions:

| Field | Sources | Digests | Notes |
|---|---|---|---|
| `url` | ✅ | — | only identifying label today — no title anywhere |
| `contentType` | ✅ (`article`/`video`/`unknown`) | — | |
| `status` | ✅ | ✅ | |
| `fetchedAt` / `createdAt` | ✅ | ✅ | date-range filtering works today |
| `digestGoal` | — | ✅ (`tl_dr`/`summary`/`understand`) | no separate "compare"/"evolution" goal — multi-source shape comes from the prompt + which sources/blocks were used, not a distinct goal value |
| `sourceHash(es)` | — | ✅ | multi-source digests carry an array (`sourceHashes`), with `sourceHash` kept as the first element for the existing GSI |
| **`title`** | ❌ | ❌ | **doesn't exist.** Firecrawl's response includes `data.data.metadata.title` for free — `ingest-url/handler.ts` currently discards everything but `.markdown`. Cheapest, highest-impact fix: capture and store it. Without this, Browse just shows raw URLs. |
| **`subject`/`tags`** | ❌ | added to `DigestMeta` schema, **not yet generated** | see Data model section below — schema is decided, generation isn't wired |
| `digestType`/`tone`/`length`/`difficulty` | — | schema exists, unused | `DigestMeta` (`packages/catalog/src/page/DigestMeta.schema.ts`) is defined but `generate-digest/handler.ts` never populates or stores it |
| `embedding` | ✅ | — | fuel for semantic search, gated on the `SourcesTable` migration actually landing (see Prerequisite) |

**Bottom line:** no tags today (design decided, not built), and `title` is the
one true gap worth closing before Browse ships — everything else
(`contentType`, `status`, date range, `digestGoal`) is already there to filter
on immediately.

## Prerequisite: finish the SourcesTable migration safely

The phase-2 vector-search work changes `SourcesTable` from a CDK `TableV2`
construct (→ `AWS::DynamoDB::GlobalTable`) to a raw `CfnTable`
(→ `AWS::DynamoDB::Table`) to get the vector index — in progress now
(`bookmark-digest-stack.ts`, per `plans/phase-2-handoff.md` §4a).
**These are different CloudFormation resource types at the same construct id
— CloudFormation will replace the table, not update it in place.** The
current in-progress diff doesn't yet set a retain/replace-safety policy.
Before this is deployed:

- Add `cfnTable.cfnOptions.updateReplacePolicy = cdk.CfnDeletionPolicy.RETAIN`
  so the *old* table isn't deleted outright.
- RETAIN only prevents deletion of the orphaned old table — the stack's
  `SourcesTable` reference now points at a brand-new, empty table regardless.
  Any already-ingested sources need an explicit copy step (scan old table →
  write to new table) before or immediately after cutover, or Browse launches
  showing an empty list.

This blocks Browse's semantic-search layer (needs the new vector index) and,
more importantly, blocks losing every bookmark ingested so far. Resolve this
as part of finishing phase-2, not as part of this plan — but Browse can't be
considered "done" if it ships against a freshly-emptied table.

## Data model additions

1. **`title`** (Sources) — capture `data.data.metadata.title` from the existing
   Firecrawl response in `ingest-url/handler.ts`; store on `sourcesPut`. Fall
   back to the URL for display when absent (covers rows ingested before this
   change — no backfill required for a personal-scale dataset, but a one-time
   backfill script that re-fetches metadata for existing rows is a cheap
   optional add if you want old bookmarks to look consistent).
2. **`domain`** — derive from `url` at read time (`new URL(url).hostname`),
   client-side or in the list Lambda. No storage needed, no migration.
3. **`DigestMeta` (`digestType`/`tone`/`length`/`difficulty`/`subject`/`tags`)
   — schema decided, generation not wired.**
   - `subject` — required, small curated enum (`engineering`/`ai-ml`/`design`/
     `business`/`science`/`productivity`/`culture`/`health`/`finance`/`other`,
     `packages/catalog/src/enums.ts`). Primary browse filter — an enum
     specifically because reliability ("everything tagged ai-ml actually
     shows up together") matters more here than precision, so the model can't
     drift into inconsistent free-text spellings for the field driving the
     top-level filter.
   - `tags` — optional, 1-6 free-ish strings (`"CSS"`, `"Design Systems"`).
     Secondary search/refinement layer where occasional inconsistency is
     fine. Together these give a "broad category / specific topic" split
     without building real parent-child taxonomy storage.
   - **Self-expanding tag vocabulary (design decided, not yet built).** Plain
     free-form `tags` risks fragmenting over time (`"CSS"` vs `"css"` vs
     `"Stylesheets"` as separate values that should be one). Fix: a small
     `TagsTable` — keyed by normalized (lowercase/trimmed) tag name, storing
     display casing + usage count. At generation time, fetch the existing
     vocabulary (cheap at personal scale) and prompt the model to prefer
     reusing an existing tag, minting a new one only if none genuinely fit.
     After generation, upsert whatever tags came back (increment count on a
     normalized match, insert new otherwise) — this is what makes tag
     creation "automatic when nothing fits" rather than reinventing the
     vocabulary from scratch every digest. Doubles as the source for a
     tag-filter/autocomplete UI in Browse, rather than mining tags from a full
     Digests scan. New table — not built yet, deferred to phase-3 execution.
   - Still open: wiring generation itself. `generate-digest/handler.ts`
     currently only produces the Spec tree (via `catalog.prompt()` +
     `generateText`) — nothing populates `DigestMeta` yet. Needs either a
     second small structured-output call, or extending the existing call to
     also emit the meta object.

## New goals: `analysis` and `report`

For long papers / heavy-data content where `tl_dr`/`summary`/`understand`
don't fit well. **Not yet added to `digest-goals.ts`** — schema-side prep is
done (`ComparisonTable`'s description now explicitly covers single-source data
tables, not just multi-source comparison, so a results table from one paper
has somewhere to render), but the two `DigestGoalConfig` entries + prompt
templates themselves still need writing. `allowedBlockTypes` (mentioned in
`digest-goals.ts`'s own file-header comment) doesn't actually exist as a field
on `DigestGoalConfig` — it's aspirational, unbuilt. Don't build that gating
mechanism speculatively; a good prompt template steering toward
`StatCard`/`ComparisonTable`/`QuoteBlock` should suffice, and it's cheap to add
later if the model actually picks poorly-fitting blocks in practice.

## Search implementation

Two tiers, matching the project's existing "brute-force is fine at this scale"
pattern (`similarity.ts`'s own comment says as much):

- **v1 — structural filter + substring match.** Extend the existing
  `sourcesScan()` pattern (already used by `list-sources`) with a
  `FilterExpression` for `contentType`/`status`/date-range, plus a plain
  case-insensitive substring check against `title`/`url` done in the Lambda
  after the scan (DynamoDB has no native text search; a `contains()`
  `FilterExpression` works for exact substrings but won't case-fold, so
  filtering in code after the scan is simpler and correct at this scale).
  Same approach for a new Digests list endpoint, matching on `digestGoal`,
  `status`, `sourceHash(es)` and date range.
- **v1.5 — semantic search**, once the `SourcesTable` migration is actually
  live: reuse the same embedding + `sourcesKnnQuery` path
  `RelatedFromYourBookmarks` uses, but driven by a search-box query embedded
  on the fly rather than another source's embedding. Purely additive — v1
  ships without it.

Skip a real search engine (OpenSearch etc.) entirely — it's solving a
scale problem this project doesn't have.

## API additions

- **`GET /sources`** already exists (`list-sources` Lambda, full unconditional
  scan, no filters, returns raw `embedding` arrays in the payload — wasteful
  for a list view). Extend it to accept query-string filters
  (`contentType`, `status`, `q` for substring, `from`/`to` for date range) and
  drop `embedding` from the list response (fetch it only on the detail view).
- **`GET /digests` list-all doesn't exist yet** — the current `GET /digests`
  route requires `sourceHash` (single-source lookup only). Add a genuine
  list-all mode (no `sourceHash` param) with the same filter query params,
  mirroring `list-sources`'s shape.
- Both should return lightweight rows (id/hash, title/url, a couple of
  badges' worth of metadata) — not the full `output` Spec tree or `embedding`
  — reserving the heavy payload for the existing per-item detail endpoints.

## Frontend

- New route, e.g. `/browse`, with a Sources/Digests toggle (or a combined feed
  — worth a quick call once the API shape is settled, not a blocker to start).
- Filter chips: `contentType`, `status`, date range, `digestGoal` (Digests),
  `subject`/`tags`/`digestType`/`tone`/`difficulty` once populated.
- Search box wired to the `q` param.
- List rows show `title` (fallback: hostname + truncated path), `domain`,
  and for Digests: a badge showing single vs. multi-source (with a source
  count), and which shape it is (comparison/evolution/single) inferred from
  which blocks the stored `output` actually contains — no new field needed for
  that, since `ComparisonTable`/`TimelineEvent` presence in the Spec tree
  already tells you.
- Row click → existing detail routes (`/digests/:digestId` already exists;
  a source detail view may not — check before assuming one exists).

## Sequencing

1. Finish phase-2's `SourcesTable` migration safely (retain policy + data
   copy) — hard blocker, independent of everything else here.
2. Capture `title` on ingest (Firecrawl metadata) + wire `DigestMeta`
   generation (`subject`/`tags`, plus the tag-vocabulary table) — cheap,
   unblocks everything else being useful.
3. Extend `list-sources` with filters; add the Digests list-all endpoint.
4. Build the `/browse` page against those two endpoints (structural
   filter + substring search only).
5. Layer semantic search once the vector index is confirmed live.
