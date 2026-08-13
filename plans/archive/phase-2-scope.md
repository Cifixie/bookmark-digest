# Phase-2 scope

**Context:** Phase-1 (`plans/phase-1-*.md`) shipped the two-axis catalog, digest
generation (Gemini + Bedrock Haiku fallback), and the goal picker UI, and has
been dogfooded successfully. This is the intake for what's next.

**Decided:** additional single-source digest *types* (Learn/Research/etc.) are
off the table for now — `tl_dr` (mini version), `summary` (thorough), and
`understand` (beginner-friendly) already give good coverage of the single-source
path. The priority shifts to **multi-source** digests instead.

## Multi-source (the main push)

One backend capability — generate a digest from a *set* of `sourceHash`es
instead of one — with two front-ends and two content shapes:

- **Comparison shape** — user explicitly multi-selects N sources that are
  variants of the same thing (e.g. googling "best headphones 2026", picking
  the top 5 reviews, generating one combined comparison). Renders via the new
  `ComparisonTable`/`Versus` catalog block.
- **Evolution shape** — sources that are the same topic sampled across time
  (e.g. "state of web 2026" + "2025" + "2024", or "BEST XXX" posts from
  successive months). Renders via the new `TimelineEvent` catalog block.
- Both shapes need **`AuthorCard`** for attributing a synthesized claim back
  to which source/author it came from — not optional once a digest merges N
  inputs instead of summarizing one.
- `DecisionItem` (previously listed Tier-3) — cut. No concrete use case
  surfaced for it; would be building a block speculatively.

Two ways a set of sources gets assembled, worth keeping distinct:

1. **Manual picker** — user explicitly selects existing saved bookmarks.
   Doesn't depend on anything else; can ship first.
2. **Suggested bundle** — the system proactively suggests a bundle of already
   -saved bookmarks it judges related (either "these are all reviews of
   similar products" → comparison, or "these are dated snapshots of the same
   topic" → evolution). This is `RelatedFromYourBookmarks`'s job, and it's
   currently too weak to power it (see below) — so suggested-bundle UX is
   gated on that upgrade landing first. Manual picker is not gated on it.

## Enabling work

- **`RelatedFromYourBookmarks` → native DynamoDB vector search** — currently
  brute-force cosine similarity over the full Sources table
  (`apps/infra/lib/similarity.ts`), explicitly written as a placeholder for a
  real vector index (`plans/dynamodb-migration.md` §2). DynamoDB shipped
  native vector search 2026-08-05, removing the reason this was deferred.
  Required before "suggested bundle" (above) is worth building — a weak
  similarity signal would suggest bad bundles.
- ~~Real Step Functions implementation~~ — **dropped**. The
  `StateMachineArn` in `outputs.json` is a stale leftover from an earlier
  design; the actual ingestion pipeline already uses a DynamoDB Streams
  trigger (`SourcesTable` stream → `embedSourceFn`,
  `bookmark-digest-stack.ts:117,156,189`), which works and is simpler. No
  work needed here.

## Parked (not now)

- **Iterative "I found this, but then found that" refinement** — adding one
  more source to an *existing* digest and having it adjust, rather than
  generating fresh from a fixed set. Needs its own "modifying prompting"
  approach distinct from multi-source generation. Explicitly deferred.
- **"Explore this"** — agent-driven topic exploration (scholarship mode):
  given a topic/query instead of a URL, an agent loop plans → searches →
  fetches sources → then hands off to the *same* multi-source generation
  capability above. Reuses everything once sources are gathered; only the
  input stage differs. Largest, riskiest item — best tackled once multi-source
  generation itself is proven with a human-curated source set.
- **Design pass** — apply visual design to the JSON sample payloads already
  produced during Phase-1, held off on until the catalog stabilized.
- **Dynamic category system** — AI-suggested digest variants via tool calls
  + a human curation pipeline, instead of the static `DIGEST_GOALS` array.

## Proposed sequencing

1. Multi-source backend (`sourceHash[]` in, one digest out) + manual picker
   UI — no dependency on anything else.
2. `ComparisonTable`/`Versus` + `AuthorCard` catalog blocks (comparison shape
   usable end-to-end).
3. `TimelineEvent` catalog block (evolution shape usable end-to-end).
4. `RelatedFromYourBookmarks` vector-search upgrade.
5. Suggested-bundle UX on top of (1)+(4).
