# Phase-3: Browse (Sources + Digests) with search

**Context:** assumes phase-2 (`plans/phase-2-scope.md`, `plans/phase-2-handoff.md`)
is complete — multi-source digest generation and the `ComparisonTable`/
`AuthorCard`/`TimelineEvent` blocks have shipped, and
`RelatedFromYourBookmarks` works. This is the step right before "Explore this"
(phase-4): you need a usable way to browse what you already have before an
agent starts adding more of it.

**Phase-2 status:** complete, with one correction to what this plan originally
assumed. The DynamoDB native vector index was built and then **reverted** —
`SearchVectors` can't express the query it needed, and its operational cost
isn't justified at this scale. `RelatedFromYourBookmarks` runs on brute-force
cosine similarity over a paginated scan (`lib/similarity.ts`), which is
correct today and good for well past the current corpus. `SourcesTable` is
still a `TableV2`. See `plans/phase-2-handoff.md` §4 for the full reasoning
before assuming a vector index is available to build on.

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
| `embedding` | ✅ | — | fuel for semantic search; usable today via brute-force cosine similarity, no index needed (see Semantic search below) |

**Bottom line:** no tags today (design decided, not built), and `title` is the
one true gap worth closing before Browse ships — everything else
(`contentType`, `status`, date range, `digestGoal`) is already there to filter
on immediately.

## Prerequisite: none — but keep `cdk diff` honest

This plan previously called out a real hazard: the phase-2 vector work swapped
`SourcesTable` from `TableV2` (`AWS::DynamoDB::GlobalTable`) to a raw
`CfnTable` (`AWS::DynamoDB::Table`) at the same construct id, which changes
both the resource type *and* the logical ID — CloudFormation would have
replaced the table rather than updating it, pointing the stack at an empty one.
That was caught before deploy and the migration is reverted; the live table is
untouched (`SourcesTable1DBF2A17`, `DeletionPolicy: Retain`, PITR now on).

The lesson stands for anything in this phase that touches the tables: run
`npx cdk diff` and confirm `SourcesTable` shows as `[~]` (modify), never
`[-]`/`[+]`. A logical-ID or resource-type change reads as an innocuous
refactor in the source diff and as data loss in the change set.

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
   - `subject` — small curated enum (`engineering`/`ai-ml`/`design`/
     `business`/`science`/`productivity`/`culture`/`health`/`finance`/`other`,
     `packages/catalog/src/enums.ts`). Primary browse filter — an enum
     specifically because reliability ("everything tagged ai-ml actually
     shows up together") matters more here than precision, so the model can't
     drift into inconsistent free-text spellings for the field driving the
     top-level filter. Currently `.optional()` in the schema, since nothing
     produces it yet — tighten to required in the same change that wires
     generation, and backfill existing digests then.
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
- **v1.5 — semantic search**: reuse the same embedding + cosine-ranking path
  `RelatedFromYourBookmarks` uses (`related-sources` Lambda +
  `lib/similarity.ts`), but driven by a search-box query embedded on the fly
  rather than another source's embedding. Needs no index — it's the same scan
  plus one Bedrock embed call. Purely additive; v1 ships without it.

Skip a real search engine (OpenSearch etc.) entirely — it's solving a
scale problem this project doesn't have.

## API additions

- **`GET /sources`** already exists (`list-sources` Lambda: full paginated
  scan, no filters, projects only list-view fields and reports `embedded:
  boolean` rather than the vector). Extend it to accept query-string filters
  (`contentType`, `status`, `q` for substring, `from`/`to` for date range).
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
5. Layer semantic search (embed the query, rank with the existing
   cosine-similarity path).
