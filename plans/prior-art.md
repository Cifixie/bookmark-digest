# Prior-art evaluations

Repos evaluated Aug 21–27, 2026, while scoping Fork A. Recorded so the same
repos don't get re-evaluated and so the transferable signals stay attached to
the plan that consumed them.

"Ruled out" means *not adopted as a dependency or a design to copy* — several
of them still contributed the idea that shaped a decision. That column is the
useful one.

| Repo | Verdict | Transferable signal | Landed in |
| --- | --- | --- | --- |
| `docling-graph` | Ruled out — wrong problem | Deterministic provenance pattern | `plans/paper-entity.md` citation model; structural provenance in `plans/extraction-and-tldr.md` |
| `book-to-skill` | Backburner — revisit post-Paper | Tiered representation; validates the extraction/generation split; incremental re-indexing | `plans/extraction-and-tldr.md` (split validation) |
| `DeepPaperNote` | Ruled out — scope mismatch, no provenance layer | "Stop and ask for better material rather than fake completeness" | `plans/source-health.md` governing rule |
| `Understand-Anything` | Validation, not a new direction | Confirms deterministic extraction + fingerprinting patterns already chosen | `plans/extraction-and-tldr.md` |
| `AutoResearchClaw` | Ruled out — superseded by the structural-provenance decision | Claim-verification framing, generalized rather than adopted | `plans/extraction-and-tldr.md` — replaced the originally-scoped standalone claim-verification pass |
| `Hyper-Extract` | Ruled out | "Incremental Evolution" — corroborates the backburner clustering idea | `plans/paper-entity.md` |
| `webclaw` | Deferred | An alternative to Firecrawl | Revisit **only** if Firecrawl cost or rate limits become a real, measured problem |
| `OmniParse` | Ruled out | — | — |

## The one thing three of them agreed on

`book-to-skill`, `Understand-Anything`, and this project's own history all
independently point at the same architecture: **extract deterministically
once, generate presentations from the extraction.** Fork B's existing "2
model calls, not 1 or 3" decision (`wiki/decisions.md`) is a smaller-scale
version of the same instinct, arrived at for unrelated reasons.

Three independent arrivals at one design is the strongest evidence available
here that the fork bridge (`plans/extraction-and-tldr.md`) is the right
central bet, which is why it sits second in the queue rather than being
sequenced opportunistically.
