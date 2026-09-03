# Roadmap — bookmark-digest / Sediment

**Third iteration of planning, restructured 2026-09-03.** Iteration 1
(`plans/archive/`) took the project from a Phase-0 skeleton to a working
two-axis digest catalog. Iteration 2 (the previous version of this file) ran
that to a browse/search UI, multi-source generation, thin-fetch detection, and
a source detail page. Iteration 3 — this file — is a **pivot in direction, not
a replacement of the product.**

**Read `docs/two-fork-architecture.md` first.** It defines Fork A / Fork B /
the bridge, and answers "where does this piece of work go." This file is only
the queue.

**How to read this:** the shipped rendered-digest product is now **Fork B**,
secondary. The new primary direction is **Fork A** (Sediment) — accumulation,
emergence, recall. The queue below is Fork A work plus the one bridge item
that keeps Fork B healthy. Do them roughly in order; item 4 is a hard gate,
not a suggestion.

---

## Where things stand

### Fork B — shipped (this is the whole of Milestones 1 and 2)

- **Two-axis catalog** — `source-variant` (written/temporal) ×
  `digest-block` (25 blocks, all registered, all rendered — `registry.tsx`
  throws at load if one isn't). React-free `packages/catalog`, renderers in
  `apps/web`.
- **Storage** — DynamoDB `Sources` + `Digests`, not Aurora. Streams-triggered
  embedding, on-demand billing, no VPC.
- **Content model** — json-render's native `Spec` tree, per-type props
  validated on top via `validateDigestSpec`.
- **Generation** — single-source (`tl_dr`/`summary`/`understand`) and
  multi-source, with the independent `sourceMode` axis. Gemini primary,
  Bedrock Haiku fallback on quota exhaustion.
- **Retrieval** — brute-force cosine over a paginated `Sources` scan. Settled,
  not a stopgap (six documented failure modes behind the reverted native
  vector index — `wiki/decisions.md`).
- **Browse + search + source detail** — `/browse`, structural filters,
  substring and semantic search, `/sources/:contentHash` with a "Related from
  your bookmarks" panel.
- **Milestone 2 queue, as delivered:** digest metadata completeness ✅ ·
  suggested bundles / `inferSourceMode` ✅ · thin-fetch detection Part A ✅ ·
  source detail page ✅ · **Explore-agent ⬜ (still unbuilt)**.
- **Clients** — web, Android share target, and the push-source CLI
  (end-to-end wiring unfinished — see [[current-work]]).

Nothing here changes architecturally under the pivot. It just stops being the
whole product.

### Fork A — not built

Every item in the queue below.

---

## The queue

### 1. `plans/s3-source-of-truth.md`
S3 becomes canonical for raw + extracted content, keyed by `contentHash`.
Sources becomes an index with a pointer. First because everything downstream
wants a durable place to point: SourceHealth's recheck needs an archive to
compare against, extraction needs a stable re-computable input, and moving
`content` out of the DynamoDB item is what makes Sources scannable at feed
volume. Includes the resolution of "replace or run alongside" — alongside,
behind one accessor, then backfill, then drop.

### 2. `plans/extraction-and-tldr.md` — **the fork bridge**
Source-level TL;DR and extraction structure (`KeyPoints`, `Statistics`,
`QuoteBlocks`, `Themes`), computed once at ingestion, read by both forks. Get
it right once; both forks depend on it. Also where citation provenance becomes
structural rather than a post-hoc verification pass — which is Paper's hardest
part, done early and cheaply.

Watch the naming trap: `digestGoal: "tl_dr"` is Fork B's shipped enum value
and has nothing to do with the new `Source.tldr` field.

### 3. `plans/source-health.md`
Generalize `detectThinFetch()` from a one-time ingestion check into an ongoing
property: `health` as a field rather than an overloaded `status`, periodic
recheck (rot and paywalls emerge *after* saving), paywall detection as a flag
not a bypass, and real override paths. Includes the resolution of the
file-upload question — **pull it forward**, it's the recovery arm of the
detection this adds, and it was never actually volume-gated.

### 4. `plans/substrate-tagging-and-dedup.md` — **hard gate**
Topic auto-tagging with a managed vocabulary, near-duplicate collapsing into
clusters. **Nothing below this line may start before this finishes and
backfills.** Accumulation before AI: capability features run against an
untagged, duplicate-heavy pile don't fail loudly, they just quietly produce
junk until you stop trusting them.

### 5. `plans/emergence-feed.md`
The first surface that is Sediment rather than bookmark-digest. TL;DR plus
*relational* reactions ("connects to 4 things you saved", "same topic again"),
built on retrieval that already exists and a generalized `inferSourceMode`.
No new clustering infra. "Contradicts" waits for a real tension pass.

### 6. `plans/extraction-and-tldr.md` Phase 3 — point Fork B at the bridge
Swap `generate-digest`'s input from raw content to the Source-level extraction
structure. Not urgent day one — Fork B keeps working from raw content — but do
it **before** Fork A absorbs sustained engineering attention, so Fork B
degrades gracefully instead of rotting. Mandatory regression check: same
source at all three goals, before and after, diffed. Validation passing is not
evidence the digests are still good.

### 7. `plans/interest-profile.md`
Cluster centroids + tag weights + recency, materialized to rank the emergence
feed. Nearly free once 4 and 5 exist — a derived view, not new infra.

**Its one immediate requirement, though:** keep user-scoping clean and
explicit in key design *now*, while items 1 and 3 are touching these items
anyway. Cheap now, expensive to retrofit.

### In parallel, whenever convenient
- Finish the push-source CLI end-to-end (`login` → `extract` → `create` →
  `POST /sources`). Fork-A-relevant ingestion client, independent of the
  pivot.
- Share-sheet PWA, if it becomes wanted — re-scoped as a *third client on an
  already-proven `POST /sources` contract* (web, Android, and CLI all do this
  already), not a from-scratch design. Not urgent.

### Only after 1–7 are solid
Tension detection and topic clustering as their own pass, then
`plans/paper-entity.md` (schema already decided, table + join-item GSI when it
unblocks).

---

## Not queued

### Deferred, with a trigger
- **`plans/multi-catalog-gating.md`** (`allowedBlockTypes`, Fork B) — an
  earlier draft of the pivot called this moot on the assumption rendering
  would be retired. Rendering is **not** being retired, so it's back to
  genuinely deferred: re-read only if the model actually reaches for the wrong
  block in practice.
- **Statistical signal-density thin-fetch threshold** (`source-quality-and-upload.md`
  Part B) — gate is ~50 sources / ~10 known-bad labelled examples, still
  unmet. SourceHealth's recheck loop is what will generate that corpus.
- **`webclaw`** — revisit only if Firecrawl cost or rate limits become a
  measured problem (`plans/prior-art.md`).

### Parked
`plans/PARKED.md` — progressive digest streaming, S3 Glacier *lifecycle
policy* (distinct from item 1: that's storage architecture, this is a cost
policy on top of it), image/OCR ingestion.

### Explicitly still alive, unchanged
**`plans/explore-agent.md`** (Fork B's capstone). No retargeting needed —
under the two-fork model there's no pressure to change its output format. It
can keep producing rendered digests indefinitely, or later read from the
shared extraction structure like any other Fork B generation path.

---

## Corrections to the incoming handoff

`raw/HANDOFF.md` is the raw input this iteration was written from. Two of its
claims didn't survive contact with the repo, and the queue above reflects the
repo:

1. **There is no Next.js → Vite migration.** `apps/web` is already a Vite SPA
   (`"dev": "vite"`, `react-router-dom`, `src/main.tsx`, no `next` dependency
   anywhere). The handoff's §9 step 4 has been dropped from this queue
   entirely rather than folded into item 5. The Next-style `page.tsx` naming
   under `src/app/` is a cosmetic leftover convention.
2. **File upload was never volume-gated** — only the statistical thin-fetch
   layer is. It's pulled forward into item 3. Details in
   `plans/source-health.md`.

---

## Running this on a budget — using the local model

Per CLAUDE.md, Qwen3.6-35B (via oMLX) is available locally alongside
Claude/Pi. Each plan above carries a "Local-model fit" section. The pattern is
unchanged: **local model for pure-function/local-file work that doesn't need
live AWS state or cross-file architectural judgment; Claude/Pi for CDK,
deployment verification, key/GSI design, and anything touching the two-axis
system's invariants** (registry exhaustiveness, prompt-axis composition
order, GSI-key normalization).

The pivot shifts the balance toward the local model, not away from it: the
substrate work in items 2 and 4 is unusually heavy on pure functions (tag
normalization, edit distance, cosine thresholding, anchor resolution, zod
schemas). Keep CDK diffs, IAM grants, and route wiring on Claude/Pi — per
`wiki/gotchas.md` that's exactly where silent failures have slipped through.
