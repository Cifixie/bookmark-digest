# Fork B reads the extraction structure

**Fork:** B, consuming the bridge.
**Queue position:** sixth. Deliberately after Fork A work has started
(`plans/emergence-feed.md`, item 5) and before Fork A absorbs sustained
engineering attention — so Fork B degrades gracefully instead of rotting, but
doesn't block Fork A's early items.
**Status:** not started. Depends on `plans/extraction-and-tldr.md` Phase 1
being written and stable.

## What this builds

Swap `generate-digest`'s prompt input from raw source content to the
Source-level extraction structure (`Source.tldr`, `KeyPoints`, `Statistics`,
`QuoteBlocks`, `Themes` — written once per source by
`plans/extraction-and-tldr.md`). Every digest-type/tone/length variant
becomes a templated transform over one extraction rather than an independent
LLM generation call over raw content per variant.

## Why it's split out from the bridge plan

Writing the extraction structure (`plans/extraction-and-tldr.md`) and reading
it from Fork B are different risk profiles:

- Writing it is new, additive, and nothing depends on it yet — safe to land
  incrementally with a backfill script.
- Reading it from Fork B means changing the input to `generate-digest`, which
  touches the two-axis system's prompt-composition invariants (goal → mode →
  `GROUNDING_RULES` → `catalog.prompt()`). That composition order must not
  change while the input to it does. This is the documented danger zone —
  not a good idea to bundle with Phase 1/2 work that's otherwise routine.

It's also explicitly **not urgent day one**: Fork B keeps working from raw
content in the meantime, so this plan can wait for item 5 without Fork B
silently degrading. `plans/ROADMAP.md` item 6.

## What has to hold

- Composition order in `apps/infra/lib/digest-goals.ts` (goal template → mode
  template → `GROUNDING_RULES` → `catalog.prompt()`) is unchanged. Only the
  user-turn source material changes, from raw content to the extraction
  structure.
- The goal/mode templates are written to describe source material — check
  each one still reads correctly when "source material" means extraction
  output (TL;DR + `KeyPoints`/`Statistics`/`QuoteBlocks`/`Themes`) instead of
  raw text.
- `GROUNDING_RULES` still applies and still outranks both templates.

## Mandatory regression check

Not optional. Generate the same source at all three `digestGoal` values
(`tl_dr`, `summary`, `understand`) before and after the swap, and diff.
"The output still validates" is not evidence the digests are as good —
`validateDigestSpec` has never checked quality, only shape.

## Local-model fit

Keep this entire plan on Claude/Pi. It touches the two-axis system's
composition invariants (registry exhaustiveness, prompt-axis composition
order) — per `wiki/gotchas.md`, exactly where silent failures have slipped
through before. Not a good fit for the local model even though the
surrounding extraction work (`plans/extraction-and-tldr.md`) is.
