# Paper entity (Track 3) — parked, schema decided in advance

**Fork:** A.
**Status:** parked, with an explicit unblock condition. Not queued.
**Unblock condition:** Fork A's substrate is *complete* — auto-tagging,
near-duplicate collapsing, embeddings, and the extraction structure all
landed and backfilled (`plans/substrate-tagging-and-dedup.md` "Definition of
done").

This doc exists so the parked idea doesn't get re-derived from scratch, and
because two of its decisions constrain work happening sooner.

## What a Paper is

A multi-source research document with structural citations. Not a digest —
a digest is generated from sources and is cheap, disposable, and
regenerable. A Paper is authored over time, accumulates sources, and its
citations are load-bearing.

## Schema shape (decided)

- **Its own DynamoDB table.** Consistent with the three-fork-scoped-tables
  decision (`docs/two-fork-architecture.md`) — not a single unified table.
  The single-table-vs-two-table debate that ran through earlier handoff
  versions is closed; S3-as-source-of-truth resolved it.
- **Join items linking Paper→Sources**, with a GSI for bidirectional lookup
  ("which sources does this Paper cite" and "which Papers cite this source").
- **The citation model is stored structurally on the join items** —
  deterministic, not re-derived by a model at read time.

## Why it constrains earlier work

The citation model is not new work by the time Paper starts. It is the
structural provenance built into the extraction structure
(`plans/extraction-and-tldr.md`): each `KeyPoint` / `Statistic` /
`QuoteBlock` carries where in the source it came from. Paper's join items
reference those anchors.

This is the reason that plan insists provenance is structural rather than a
post-hoc verification pass. If provenance is added afterward by a separate
verifier, Paper has nothing deterministic to cite and the whole entity gets
much more expensive. Getting it right in the extraction call is doing Paper's
hardest part early, cheaply.

## Prior art

Full evaluations in `plans/prior-art.md`. The four that bear on Paper:

- **`docling-graph`** — the deterministic provenance pattern. Ruled out as a
  dependency (wrong problem), transferable as a pattern.
- **`book-to-skill`** — tiered representation and incremental re-indexing.
  Backburner, revisit post-Paper.
- **`DeepPaperNote`** — ruled out (scope mismatch, no provenance layer). Its
  "stop and ask for better material rather than fake completeness" rule
  became SourceHealth's governing rule.
- **`Hyper-Extract`** — ruled out; its "Incremental Evolution" framing
  corroborates the backburner clustering idea rather than replacing it.

## If picked up

Scope as a real plan then, not from this file. Open at that point: what
authoring a Paper looks like as a UI, whether Papers reuse Fork B's rendering
or get their own surface, and whether "accumulates sources over time" means
an explicit user action or a profile-driven suggestion.
