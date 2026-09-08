# Point Fork B at the extraction structure

**Fork:** Fork B (read by Fork B, written by the bridge).
**Queue position:** sixth, after items 1–5 in `plans/ROADMAP.md` are solid.
**Status:** not started.

## What this does

Swap `generate-digest`'s prompt input from raw source content to the
Source-level extraction structure (`KeyPoints`, `Statistics`, `QuoteBlocks`,
`Themes`, TL;DR) computed once at ingestion and stored in S3.

This makes every digest-type/tone/length variant a templated transform over
one extraction instead of an independent LLM generation call per variant.

For Fork B's resilience: if Fork A takes sustained engineering attention,
Fork B can still produce rendered digests from already-made TL;DR and summary
segments rather than losing access to raw content entirely.

See `plans/extraction-and-tldr.md` for why the structure exists; this plan is
only about the migration point.

## What changes

**Input.** The goal/mode templates in `digest-goals.ts` describe source
material. The composition order (goal → mode → `GROUNDING_RULES` →
`catalog.prompt()`) **must not change** — only the input that gets fed into
that composition. Today the input is raw `extracted.md` content from the
source item. After this plan, it's the extraction structure + TL;DR from
S3/`Sources`.

**Prompt rework.** The goal and mode template text needs to stop referring to
"the source article" and start referring to "the extraction structure." This
is prompt-axis work, not a structural refactor. The prompt still produces a
json-render `Spec` tree; the schema and the `generate-digest` handler don't
change.

**Source-of-truth seam.** The `getSourceContent()` accessor from
`plans/s3-source-of-truth.md` step 2 will already be in place by the time
this runs. `generate-digest` reads from the seam; the seam routes to the
extraction structure once the plan is picked up. If the extraction is missing
or corrupt, fall back to raw content and log a warning — that's the graceful
degradation path.

## Mandatory regression check

Generate the same source at all three `digestGoal` values (`tl_dr`, `summary`,
`understand`) before and after the change, and diff the outputs.

"The output still validates" is **not** evidence the digests are as good —
`validateDigestSpec` has never checked quality. The diff should be inspected:
key points should not disappear, statistics should not be hallucinated where
none existed, and the Spec tree should have the same structural depth.

This is not an automated check. It's a deliberate human comparison against
3–5 representative sources covering different source types.

## Guardrails

- **Do not change the prompt composition order.** The invariant (goal → mode
  → `GROUNDING_RULES` → `catalog.prompt()`) is explicitly listed in
  `wiki/decisions.md` as part of the two-axis system's shape. Changing the
  input is the only change.
- **Do not merge `Source.tldr` into `DigestMeta`.** They stay separate.
  `Source.tldr` is a permanent ingestion artifact; `DigestMeta` is a
  per-digest record. Merging them ties a permanent schema to a disposable one.
  See the naming trap in `plans/extraction-and-tldr.md`.
- **Do not remove raw-content fallback on day one.** The regression check
  is the verification that the extraction structure works for all three
  goals. Until then, the seam falls back to raw content.

## When to run this

Before Fork A absorbs sustained engineering attention. Fork B keeps working
from raw content today, so there's no urgency, but doing it early prevents
the "Fork B has quietly been producing from raw content for months and now
the extraction structure sits in S3 unread" scenario.

## Local-model fit

Keep on Claude/Pi: all prompt-axis work. Rewriting the goal/mode template
text to consume extraction structure instead of raw content is the exact kind
of composition-invariant work where silent failures have slipped through
before (`wiki/gotchas.md`).
