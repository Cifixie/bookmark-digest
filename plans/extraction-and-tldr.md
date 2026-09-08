# Extraction structure + Source-level TL;DR — the fork bridge

**Fork:** the bridge. Read by both forks, owned by neither.
**Queue position:** second, immediately after `plans/s3-source-of-truth.md`.
**Status:** not started. This is the single most load-bearing new piece in
Phase 2/3 — both forks depend on getting it right once.

## What this builds

Two artifacts computed **once per Source, at ingestion**, never re-derived per
Digest:

1. **TL;DR** — a short abstract of the source. One cheap LLM call.
2. **Extraction structure** — `KeyPoints`, `Statistics`, `QuoteBlocks`,
   `Themes`. One structured-output call.

Both are Source-level. They live in `extraction.json` in S3 (see the key
layout in `plans/s3-source-of-truth.md`), with the TL;DR *also* denormalized
onto the `Sources` item because Fork A's feed and recall paths need it in a
projected scan without an S3 round-trip per row.

## Why it's the bridge, not just a feature

**Phase 3** — pointing Fork B at the extraction structure — is a separate plan
(`plans/extraction-to-fork-b.md`). The actual reason this structure exists as
a shared concern is resilience: it's the mechanism behind "Fork B can build
rendered digests from already-made TL;DR/summary segments." If Fork A takes
all the engineering attention for a stretch, Fork B keeps working instead of
silently degrading.


## Naming trap — read this before writing any code

`digestGoal: "tl_dr"` (Fork B, `packages/schemas`, an existing shipped enum
value meaning "make this digest shallow") **predates and is unrelated to**
the new Source-level TL;DR field. Same word, different artifact, different
owner, different lifecycle. Do not let them share a type, a helper, or a
prompt template. Suggested discipline: the new field is `Source.tldr` and the
prompt constant is `SOURCE_TLDR_PROMPT`; never `tl_dr` in Fork A code.

Same for `DigestMeta` — it stays a separate field and is **not** merged into
TL;DR. See `wiki/decisions.md`.

## How many model calls

**Three separate calls, not one.** TL;DR, extraction structure, and
auto-tagging (`plans/substrate-tagging-and-dedup.md`) are three tasks with
different output shapes and different failure modes. Merging them would
couple those failures and make the tasks compete for attention on the hardest
one — which is exactly the reasoning that keeps Fork B's `generateMeta()`
separate from spec generation today. Carry the instinct forward; don't
re-derive it.

They can still run concurrently in one Lambda invocation. Separate calls, not
separate deployments.

All three use the existing `callGemini()` / `callBedrockClaude()` pair with
the `GeminiQuotaError` → Bedrock fallback. **Do not add a parallel
LLM-calling path.** Note the quota consequence: this adds two-to-three Gemini
calls per ingested source, against free-tier quota that the Bedrock fallback
exists to conserve. Budget for that explicitly — a plausible answer is
TL;DR/extraction default to Bedrock Haiku and leave Gemini's quota for
Fork B's much larger generation calls, but measure before deciding.

## Extraction structure — shape

Define in `packages/schemas` (not `packages/catalog` — this is Fork-neutral
and must stay importable by validation Lambdas):

- `KeyPoints: { text, category }[]` — reuse the existing `KeyPoint.category`
  enum already specified in `docs/rules.md` §4 (`concept`, `practice`,
  `risk`, `future`, `example`, `planning`, `memory`, `tools`, `challenge`,
  `harness`) rather than inventing a second vocabulary. That doc's
  "generalize `memory`/`tools`/`harness` for non-engineering sources, don't
  force-fit" guidance applies unchanged.
- `Statistics: { value, unit?, label, context }[]` — the numbers a source
  actually asserts. Fork B's `StatCard`/`Chart` blocks are the obvious
  consumer; Fork A uses them for tension detection later (two sources
  asserting different numbers for the same thing is the cleanest possible
  contradiction signal).
- `QuoteBlocks: { text, speaker?, timestampSeconds? }[]` — `timestampSeconds`
  because temporal sources exist; Fork B's `QuoteBlock` already carries that
  optional field.
- `Themes: string[]` — coarse, few. Distinct from tags: themes are
  *within-source* structure, tags are *cross-corpus* vocabulary. Keeping them
  separate is what stops the tagging substrate from being polluted by
  per-source phrasing.

## Citation provenance is structural, not post-hoc

Provenance is built into generation via structured output — each extracted
item carries where in the source it came from — rather than added by a
separate verification pass afterward. This supersedes the originally-scoped
standalone "claim verification pass" (adapted from AutoResearchClaw, now
ruled out; see `plans/prior-art.md`).

Two reasons: a post-hoc verifier is a second thing that can be wrong about
the same content, and the structural version is exactly the citation model
the `Paper` entity needs later (`plans/paper-entity.md`). Build it once, here.

Practically: an offset or a quoted anchor span per `KeyPoint` / `Statistic` /
`QuoteBlock` into `extracted.md`. Decide offsets-vs-anchors during
implementation — anchors survive re-extraction, offsets are cheaper to
validate.

## Grounding

`GROUNDING_RULES` already exists in `apps/infra/lib/digest-goals.ts` because
validation checks that props fit their schema, never that content came from
the source — a model asked for thoroughness against thin material invents
content that validates cleanly. Extraction has the same exposure and needs
the same rule composed into its prompt, plus the governing rule from the
DeepPaperNote evaluation: **stop and ask for better material rather than fake
completeness.** An extraction call against a thin source should return few
items or none, not a plausible-looking full set. That makes
`plans/source-health.md` its natural partner on the input side.

## Phasing

**Phase 1 — write it.** Extraction + TL;DR at ingestion, stored in S3 and on
the item. Nothing reads it yet. Backfill script for existing sources.

**Phase 2 — Fork A reads it.** `plans/emergence-feed.md` and recall consume
TL;DR and `Themes`.

## Fork B migration (queue 6)

Fork B's migration to reading the extraction structure — prompt-axis work on
`digest-goals.ts` — is tracked in `plans/extraction-to-fork-b.md`. See there
for the regression check and the guardrails.

## Local-model fit

Good: the zod schemas in `packages/schemas`, the anchor/offset resolution
helper and its tests, the `extraction.json` read/write helpers. Keep on
Claude/Pi: prompt authoring for all three calls, the Gemini-vs-Bedrock quota
allocation, and the prompt-axis work in
`plans/extraction-to-fork-b.md` — that touches the two-axis system's
composition invariants, which is the documented danger zone.
