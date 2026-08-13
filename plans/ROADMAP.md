# Roadmap — bookmark-digest

This is the second iteration of planning for this project. The first
iteration (`plans/archive/`) got the tool from a Phase-0 skeleton to a
working two-axis digest catalog, multi-source generation, and a browse/search
UI — all shipped, all archived there for historical record. This doc replaces
the scattered phase-N docs with one linear path and a small set of
consolidated forward-looking plans.

**How to read this file:** two milestones bracket everything. Milestone 1 is
where the project actually is today (verified against the live repo, not
assumed from old plan docs — several archived plans claimed "complete" for
things that turned out to still be missing a piece; this doc is written from
what's actually in the code). Milestone 2 is the target end-state. Everything
between is the linear queue to get there — do them roughly in order, since
later items either depend on earlier ones or share code/context with them.

---

## Milestone 1 — HISTORY (shipped, verified 2026-08-12)

- **Two-axis catalog** — `source-variant` (written/temporal) ×
  `digest-block` (25 content blocks, all registered, all rendered — the
  registry throws at load if one isn't). React-free `packages/catalog`,
  renderers in `apps/web`.
- **Storage** — DynamoDB (`Sources`, `Digests`), not Aurora. Streams-triggered
  embedding, on-demand billing, no VPC.
- **Content model** — json-render's native `Spec` tree, not a flat block
  array. Per-type props validated on top (`validateDigestSpec`).
- **Single-source generation** — `tl_dr` / `summary` / `understand` goals,
  Gemini primary + Bedrock Haiku fallback on quota exhaustion.
- **Multi-source generation** — `sourceHashes[]` in, one digest out, deduped
  and order-normalized. Independent `sourceMode` axis (`synthesize` default /
  `compare` / `evolution`) so shape doesn't get asserted from source count.
  `ComparisonTable`, `AuthorCard`, `TimelineEvent`, `ComparisonNarrative`
  blocks cover comparison/evolution/entity-profile shapes.
- **Visual blocks** — `Chart` (bar/sparkline), `PullQuote`, on top of the
  original 19 (`Grid`, `Card`, `StatCard`, etc.).
- **Related-bookmarks retrieval** — brute-force cosine similarity over a
  paginated `Sources` scan. A native DynamoDB vector index was tried and
  reverted (see [[decisions]]) — this is a settled choice, not a stopgap.
- **Embedding failure handling** — status transitions to `failed` with a
  stored reason, retry-with-backoff for throttling, a DLQ, stale-status
  guards.
- **Browse + search** — `/browse` page (Sources/Digests toggle), structural
  filters (contentType/status/date/digestGoal), substring search, semantic
  search (embed the query, rank by cosine), `title` capture on ingest,
  `DigestMeta` generation (`subject`/`tags`/`digestType`/`tone`/etc.) for
  **single-source** digests only.

Full detail and the mistakes made along the way (six DynamoDB vector-search
failure modes, the API-Gateway single-integration gotcha, the
`digestGoal`/`digestType` naming collision that almost happened) are in
`plans/archive/` and [[decisions]] / [[gotchas]]. Don't re-derive any of that
from memory — read those before touching adjacent code.

---

## Milestone 2 — TODO (target end-state)

A personal bookmark tool where: every digest (single- or multi-source) is
browsable, filterable, and semantically searchable; tag/category metadata is
consistent instead of fragmenting; source ingestion degrades gracefully
instead of silently generating from page chrome; the system can proactively
suggest related-bookmark digests instead of requiring manual multi-select;
and — the largest, most speculative piece — an "Explore this" agent that
takes a topic instead of a URL and closes the loop by driving its own
ingestion + multi-source generation.

Getting there is the queue below, in order.

---

## The queue

### 1. `plans/digest-metadata-completeness.md`
Closes the biggest gap left by Milestone 1: `DigestMeta` (subject/tags/
synopsis) only exists for single-source digests, tags have no anti-
fragmentation mechanism, and the metadata call burns the same scarce Gemini
quota as the real generation call. One plan because all three edit the same
call site (`generateMeta()` in `generate-digest/handler.ts`) — sequencing
them independently risks each PR clobbering the others' prompt changes.

### 2. `plans/suggested-bundles.md`
The one piece explicitly split out of the old phase-2 scope because it was
unblocked-but-unstarted. Its dependency (a working similarity signal) has
been satisfied since Milestone 1. No reason to wait — do this once metadata
work isn't mid-flight in the same prompt-adjacent files.

### 3. `plans/source-quality-and-upload.md`
Merges what were two separate plans (`thin-source-detection`,
`file-upload-ingestion`) because they're the same underlying problem — a
remote fetch losing fidelity — approached from two ends: *detect* that a
fetch got chrome instead of content, and *recover* by letting the user hand
over the page directly. Detection's cheap first layer (fetch-failure
markers) ships now; the statistical layer stays data-gated exactly as
before.

### 4. `plans/source-detail-page.md` — DONE (2026-08-13)
Small, standalone, no dependencies. Browse now links source rows to an
in-app `/sources/:contentHash` detail view instead of the original URL,
with metadata, extracted content, generated digests, and a "Related from
your bookmarks" panel (via `GET /sources/{sourceHash}/related`, not the
dead `DigestPage` placeholder — see the plan doc's note).

### 5. `plans/explore-agent.md`
"Explore this" — given a topic/query instead of a URL, an agent plans →
searches → fetches sources → hands off to the existing multi-source
generation path. This is Milestone 2's capstone: everything above exists to
make the ingestion/generation/browse loop solid enough that an agent driving
it autonomously is safe to build. Deliberately last, and deliberately the
least specified plan in this queue — the shape of "search the web for
sources" isn't decided yet, and shouldn't be until the rest of the queue has
shipped and been dogfooded.

### Deferred, not queued — `plans/multi-catalog-gating.md`
Kept as its own file rather than folded into the queue because it's not
scheduled — it has an explicit trigger ("the model actually reaches for the
wrong block in practice") that hasn't fired. Re-read it and reassess only if
that happens; don't build it speculatively in the meantime.

### Parked — `plans/PARKED.md`
Ideas that are real but not worth even a queue slot right now: progressive
digest streaming (needs an infra shape change — Function URL or WebSocket —
not justified until generation latency is actually measured as a problem),
S3 Glacier lifecycle policies for raw source content (no current cost
pressure to act on), image/OCR ingestion (a fourth ingestion path with its
own design questions, noted but not scoped).

---

## Running this on a budget — using the local model

Per CLAUDE.md, Qwen3.6-35B (via oMLX) is available locally alongside Claude/Pi.
Each plan in the queue above is tagged with which of its steps are good fits
to hand to the local model instead of spending Claude Code tokens on them.
The pattern: **local model for pure-function/local-file work that doesn't
need live AWS state or cross-file architectural judgment; Claude/Pi for CDK,
deployment verification, and anything touching the two-axis system's
invariants** (registry exhaustiveness, GSI-key normalization, prompt-axis
composition order). Concretely, good local-model candidates across the
queue: the tag normalization/edit-distance pure function, the fetch-failure
marker substring matcher, the HTML/PDF extraction adapters (`extract-html.ts`
/ `extract-pdf.ts`), and writing renderer components + CSS for new blocks.
Keep CDK diffs, IAM grants, and route wiring on Claude/Pi — those are exactly
where the gotchas log shows silent failures slipping through.
