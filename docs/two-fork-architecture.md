# Two-fork architecture

**Status:** current as of 2026-09-03. This is the structural reference for
which half of the system a piece of work belongs to. The *why* for each
individual call lives in `wiki/decisions.md`; the *queue* lives in
`plans/ROADMAP.md`. Read this first when you're unsure where new code goes.

Derived from `raw/HANDOFF.md` (v3, 2026-09-03), which was itself generated
from `raw/STATUS.md` (same date). Both are kept as the provenance trail for
this pivot and both are dated-and-frozen at the top — neither is maintained.
They have been processed into this file, the wiki, and the plans under
`plans/`. Where the handoff contradicted the repo, the repo won; see
"Corrections against the handoff" at the end.

---

## The shape

The project is one codebase with two products in it, plus a shared substrate
and one deliberate bridge between them.

```
                        ┌─────────────────────────────────────┐
   share / paste /      │  SHARED SUBSTRATE                   │
   upload / CLI  ──────▶│  ingest → hash → S3 (raw+extracted) │
                        │  embed · cosine retrieval · LLM call │
                        │  Cognito auth · thin-fetch detection │
                        └──────────────┬──────────────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │  THE BRIDGE (new)         │
                         │  Source-level TL;DR +     │
                         │  extraction structure     │
                         │  (KeyPoints, Statistics,  │
                         │   QuoteBlocks, Themes)    │
                         │  computed ONCE per Source │
                         └───────┬───────────┬───────┘
                                 │           │
              ┌──────────────────▼──┐   ┌────▼────────────────────┐
              │ FORK A — Sediment   │   │ FORK B — rendered digest│
              │ (primary)           │   │ (secondary, kept)       │
              │ SourceHealth        │   │ 25-block catalog        │
              │ auto-tagging, dedup │   │ registry.tsx            │
              │ emergence, recall   │   │ json-render Spec tree   │
              │ interest profile    │   │ digestGoal / sourceMode │
              │ Paper (parked)      │   │ DigestMeta              │
              │ → Sources table     │   │ Explore-agent           │
              └─────────────────────┘   │ → Digests table         │
                                        └─────────────────────────┘
```

## Fork A — the Sediment substrate (primary)

**The reframe:** the act of saving is the signal, not the URL. Fork A
accumulates saves silently; the interesting output is what emerges from
accumulation — tension, clustering, relational connection — not a digest of
any one item.

Fork A gets engineering priority when the two forks compete for time. New
work defaults here unless it is specifically a rendered-digest feature.

Owns: `SourceHealth`, topic auto-tagging, near-duplicate collapsing, the
personal interest profile, the emergence feed, recall, and eventually the
`Paper` entity. Writes to the **Sources** table (and later a **Papers**
table).

Not built yet. Every piece of it is in `plans/`.

## Fork B — the rendered digest pipeline (secondary, kept)

Everything shipped today: the two-axis block catalog, `registry.tsx`, the
json-render `Spec` tree with RFC-6902 patch compilation, `digestGoal` /
`sourceMode`, `DigestMeta`, and the not-yet-built Explore-agent.

**Fork B is not being retired.** It is framed as a good proto and
proof-of-concept, worth preserving rather than deleting. It gets whatever
maintenance it genuinely needs; it does not get priority. Its invariants
still hold — in particular `registry.tsx`'s missing-renderer guard keeps
permanent value, and the `allowedBlockTypes` allowlist
(`plans/multi-catalog-gating.md`) is still legitimately *deferred with a
trigger*, not cancelled.

Writes to the **Digests** table, unchanged.

## The bridge — TL;DR and the extraction structure

This is what makes two forks workable instead of "run two products."

Two artifacts live **once, on the Source**, and are read by both forks:

1. **TL;DR** — one cheap LLM call per source at ingestion. Serves Fork A's
   emergence feed, recall citations, and the compact-index tier for
   chat-with-corpus.
2. **Extraction structure** — `KeyPoints`, `Statistics`, `QuoteBlocks`,
   `Themes`, computed once by a deterministic extraction call.

Neither is re-derived per Digest. Fork B's generation should eventually read
from this structure instead of raw source content, which turns
digest-type/tone/length variants into templated transforms over one
extraction rather than independent generation calls per variant.

**Why this matters beyond cost:** it is the mechanism by which Fork B
degrades gracefully. If Fork A absorbs sustained engineering attention, Fork
B can keep building rendered digests from already-made TL;DR/summary segments
without needing independent raw-content access. Fork B stops rotting.

Plan: `plans/extraction-and-tldr.md`.

## Data model

**S3 is the source of truth for content.** Three fork-scoped DynamoDB tables,
not a single-table migration.

| Store | Owner | Holds |
| --- | --- | --- |
| **S3**, keyed by `contentHash` | shared | canonical raw + extracted content. Permanent archive — survives the origin URL dying. |
| **Sources** (DynamoDB) | Fork A | index: metadata, SourceHealth, tags, embeddings, TL;DR, pointer into S3 |
| **Digests** (DynamoDB) | Fork B | generated digest output, unchanged, references `sourceHash` |
| **Papers** (DynamoDB, future) | Fork A | Track 3, parked. Own table + join items back to Source. |

Plan: `plans/s3-source-of-truth.md`.

## What is genuinely shared (build once, both forks benefit)

- Cosine-similarity retrieval — brute-force scan, settled, six documented
  failure modes behind the rejection of the native vector index. Do not
  relitigate for either fork.
- The `callGemini()` / `callBedrockClaude()` functions. Fork A's TL;DR and
  extraction calls use these, not a parallel LLM-calling path.
- Ingestion escape hatches: manual paste, `Ingest.extractUrl()`,
  `detectThinFetch()`.
- The Cognito auth pattern across web / Android / CLI — including the bare
  idToken rule, which applies to every new Fork-A endpoint.
- The TL;DR + extraction structure (the bridge above). This is the one that's
  new, and the only one that's shared *by design* rather than incidentally.

## Governing sequencing principle: accumulation before AI

Substrate infrastructure — auto-tagging, near-duplicate collapsing,
embeddings — must be complete **before** AI capability features — tension
detection, Paper clustering — are layered on top. AI run against a messy,
untagged, duplicate-heavy pile produces unreliable results.

This is the single most important sequencing constraint for Fork A. It is
what makes the roadmap's order non-negotiable rather than a suggestion.

## Naming

The product direction is called **Sediment**. The repo, pnpm packages
(`@bookmark-digest/*`), CDK stack (`BookmarkDigest`), and physical resource
names stay `bookmark-digest` — renaming the stack would mean replacing
retained, deletion-protected tables for a cosmetic gain. Treat "Sediment" as
the name of Fork A and the direction, not as a rename task.

## Corrections against the handoff

`raw/HANDOFF.md` was written from `raw/STATUS.md`, and two of its claims do
not survive contact with the repo:

1. **`apps/web` is not Next.js.** It is already a Vite SPA —
   `"dev": "vite"`, `react-router-dom` with `src/app/router.tsx`,
   `src/main.tsx` calling `createRoot`, and no `next` dependency in any
   `package.json`. The handoff's §5.1 "Next.js → Vite migration (decided,
   pending)" and §9 step 4 describe work that does not exist. The likely
   cause of the confusion: `src/app/` uses Next-style `page.tsx` filenames
   and folder-per-route layout, which is a cosmetic leftover convention.
   There is no migration to fold into Fork-A UI work.
2. **File-upload ingestion is not volume-gated.** The handoff §8 lists
   "file upload ingestion, statistical thin-fetch threshold — both gated on
   volume thresholds not yet reached." Only the statistical layer is
   corpus-gated. `plans/source-quality-and-upload.md` uses "Part B" for two
   different things (signal-density scoring *and* file upload), which is
   where that conflation came from. Upload is unblocked; see
   `plans/source-health.md` for the recommendation to pull it forward.
