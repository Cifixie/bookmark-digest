# Decisions

Durable architectural calls, extracted from `plans/archive/` so the reasoning
survives even though the plan docs themselves are done. See
[[current-work]] and [[gotchas]] for what's live and what's bitten us.

## Storage: DynamoDB, not Aurora/pgvector

Target AWS account is on the Free Plan, which can't provision Aurora via CDK
(needs "express configuration," a mode CloudFormation doesn't support).
Pivoted early to DynamoDB: two `TableV2` on-demand tables (`Sources`,
`Digests`), GSIs for dedup/lookup, DynamoDB Streams to trigger embedding
instead of direct Lambda invoke. No VPC, no connection pooling, no cold-start
warmup. See `plans/archive/dynamodb-migration.md`.

## Semantic search: brute-force cosine, not a vector index

DynamoDB's native `SearchVectors` was built, found broken, and reverted — see
[[gotchas]] for the six concrete failure modes (no `<>` operator, inverted
score semantics, no backfill-wait, fixed dimensions, silently-swallowed
fallback). **Decision: brute-force cosine similarity scan stays** at
personal-bookmark scale (thousands of rows is still a cheap scan). Revisit
only when a scan measurably hurts, starting from the six documented failure
points, not from scratch.

## Two independent generation axes: `digestGoal` and `sourceMode`

Depth/voice (`tl_dr`/`summary`/`understand`) and multi-source shape
(`synthesize`/`compare`/`evolution`) are separate axes, composed
goal-template → mode-template → `GROUNDING_RULES` → `catalog.prompt()` in the
*system* prompt. The user turn carries only source material. This exists
because asserting comparison for every multi-source bundle produced wrong
shapes for complementary sources (two articles by one author). `sourceMode`
is **deliberately not inferred** from source count/content — that inference
is the same judgment call that produced the wrong shape originally. See
CLAUDE.md's "Digest Generation: Two Independent Axes" section for the full
model; this entry just records *why* it's two axes and not one.

## Naming: `digestGoal` vs `digestType`

`digestGoal` (schemas package) answers "what should the digest do." `digestType`
(catalog package, `article`/`video`/`podcast`/...) classifies the *source*.
Deliberately not merged — different axis, different owner.

## Content model: json-render's native Spec tree, not a flat block array

`generate-digest` originally produced a flat `DigestBlock[]`. Switched to
json-render's native nested `Spec` tree (`{root, elements}`, RFC-6902
patch-compiled) because that's what `catalog.prompt()` actually describes —
the flat schema was silently causing schema-minimum output (empty props).
The library's own catalog-wide schema does **not** enforce per-component
props once a catalog has >1 component (falls back to
`z.record(unknown)`) — per-type props validation is layered on top via
`validateDigestSpec`, it isn't free from adopting the tree model. See
`plans/archive/commit-to-render-json.md`.

## Registry throws on a missing renderer

`apps/web/src/lib/registry.tsx` throws at module load if any catalog block
type has no registered component. This exists because three blocks
(`ComparisonTable`/`AuthorCard`/`TimelineEvent`) shipped registered-but-
unrendered for three commits before anyone noticed. Don't remove this guard;
don't let a future multi-catalog refactor read from anything other than the
single flat `digestBlockProps` map it walks.

## Disambiguation between overlapping blocks: prompt text, not a gating mechanism

`Chart` vs `StatCard`/`ComparisonTable`, `PullQuote` vs `QuoteBlock`,
`ComparisonNarrative` vs `ComparisonTable`/`Grid`/`TimelineEvent` — all
handled via prompt-text guidance in `digest-goals.ts`, not a block allowlist.
A per-goal/mode `allowedBlockTypes` filter (or multiple `defineCatalog()`
calls) was designed twice and deliberately not built both times — see
`plans/multi-catalog-gating.md` (kept as a live deferred plan, not archived,
since its trigger condition hasn't fired yet). Building it before real
misuse is observed would be speculative infrastructure for a problem that
may not exist.

## Ingestion escape hatches exist because remote fetch loses fidelity

Firecrawl (the default fetcher) sometimes returns page chrome instead of
content (a YouTube watch page: nav/sign-in/view-counts, no transcript) or
silently drops link targets (a citation list rendered as plain text, no
`href`). Two escape hatches exist/are planned for the same underlying
problem — "the source is fine, the remote fetch isn't":
- **Manual paste** (shipped) — `POST /sources` accepts `content` directly,
  `fetchedBy: "manual"`.
- **File upload** (planned, `plans/file-upload-ingestion.md`) — same idea,
  HTML/PDF instead of pasted text, so real link targets survive.

YouTube-specific transcript fetching (InnerTube caption endpoint) was tried
*in* the Lambda and reverted — works from a residential IP, silently returns
no captions from Lambda's shared IP ranges. Survives only as a local CLI
script (`apps/infra/scripts/youtube-transcript.ts`) feeding the manual-paste
path.

## Tag reliability split: `subject` is a curated enum, `tags` is free text

`DigestMeta.subject` is a small curated enum because it's the primary browse
filter — inconsistent spellings there would fragment the top-level filter.
`tags` stays free-ish (1-6 strings) because it's a secondary refinement layer
where occasional inconsistency is an acceptable cost for not needing a real
taxonomy. The self-expanding vocabulary table to keep `tags` from fragmenting
anyway is designed but not built — `plans/digest-metadata-completeness.md`.

## Second model call for metadata is deliberately still 2 calls, not 1 or 3

Spec generation and `generateMeta()` (subject/tags/synopsis/...) are
separate model calls. Rejected: merging into the Spec-generation call
(couples failure modes, competes for context/attention on the harder task).
Rejected: an agentic tool-calling loop for the whole pipeline (no real
branching exists in the sequence to justify the indirection/cost — the
repair logic, `autoFixSpec`/null-stripping/dangling-ref pruning, is exactly
the kind of thing that should stay deterministic code).
