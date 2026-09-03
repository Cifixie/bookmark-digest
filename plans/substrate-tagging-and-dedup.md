# Substrate: topic auto-tagging + near-duplicate collapsing

**Fork:** A.
**Queue position:** fourth. **Nothing downstream of this may start before it
finishes** — see below.
**Status:** not started.

## Why this is a hard gate

The governing sequencing principle for Fork A: **accumulation before AI.**
Substrate infrastructure — auto-tagging, near-duplicate collapsing,
embeddings — must be complete before AI capability features — tension
detection, `Paper` clustering — are layered on top. AI run against a messy,
untagged, duplicate-heavy pile produces unreliable results, and the failure
is insidious rather than loud: the emergence feed doesn't crash, it just
surfaces junk connections and you slowly stop trusting it.

Embeddings are already done (shipped, Milestone 1). This plan is the other
two.

## Auto-tagging

One LLM call per source at ingestion, alongside TL;DR and extraction
(`plans/extraction-and-tldr.md`) — separate call, same invocation, for the
same "don't couple failure modes" reason.

The hard part is not generating tags, it's **keeping the vocabulary from
fragmenting**. Fork B already hit this and answered it once
(`wiki/decisions.md`): `DigestMeta.subject` is a small curated enum because
it's the primary browse filter, and `tags` stays free-ish because it's a
secondary refinement layer. The self-expanding vocabulary table designed to
stop `tags` fragmenting anyway was specified in
`plans/digest-metadata-completeness.md` and never built.

**Build it now, at the Source level.** The reason it was skippable for Fork B
is that a fragmented tag is a mildly worse filter. For Fork A it's structural:
clustering, the interest profile, and tension detection all read tags as if
they were a vocabulary. `ml` and `machine-learning` as separate tags is not a
cosmetic problem there — it's two clusters where there should be one.

Shape:
- A tag-vocabulary store (its own PK space in the Sources table, or a small
  separate table — decide during implementation; a separate table is cleaner
  but a fourth table for a vocabulary list is hard to justify).
- On generation, candidate tags are matched against existing vocabulary
  before being admitted: exact, then normalized (case/punctuation/plural),
  then edit-distance, then embedding-similarity against existing tag names.
  Admit a genuinely new tag; snap a near-match to the existing one.
- `GET /tags` already exists (`lambdas/get-tags`) — check what it reads
  before adding a second source of truth for tags.

The existing `Themes` field from the extraction structure is deliberately
*not* this. Themes are within-source structure; tags are cross-corpus
vocabulary. Don't collapse them — the whole point of the vocabulary
discipline is that tags are constrained by what the rest of the corpus
already says, and themes aren't.

## Near-duplicate collapsing

Two kinds, and they need different mechanisms:

1. **Same content, different URL.** `contentHash` already catches byte-exact
   duplicates. It misses tracking-parameter variants, AMP versions,
   syndicated reprints, and the same YouTube video via `youtu.be` vs
   `youtube.com`. `lib/resolve-url.ts` already resolves redirect chains and
   `google.com/url?q=` wrappers, which handles part of this at ingest — extend
   URL normalization rather than adding a second dedup layer.
2. **Different content, same substance.** Two articles covering one
   announcement. This is a similarity-threshold problem, and the substrate for
   it is already shipped: brute-force cosine over the Sources scan
   (`lib/similarity.ts`). Do **not** relitigate the retrieval mechanism —
   the native DynamoDB vector index was tried, found broken in six documented
   ways, and reverted (`wiki/decisions.md`).

**Collapse means group, not delete.** A cluster of near-duplicates keeps
every member — the save of each one is a real signal, and Fork A's premise is
that the act of saving is the signal. What collapsing changes is
*presentation and counting*: the emergence feed shows the cluster once, and
"you saved 4 things about this" is a stronger signal than four separate rows.
Deleting a save would destroy the exact data the interest profile is derived
from.

Practically: a `clusterId` on the Sources item plus a canonical-member flag,
assigned at ingestion by thresholded similarity against existing sources.
Expect the threshold to need tuning against a real pile; log the near-misses
so there's something to tune against.

## Definition of done

This gate is satisfied when:
- Every source (including backfilled ones) has tags drawn from a managed
  vocabulary, and adding a source with an obvious synonym of an existing tag
  snaps to the existing tag.
- Every source has a `clusterId`, and the obvious duplicate cases
  (URL variants, the same video via two hostnames, one announcement covered
  twice) land in one cluster.
- A backfill has run over the existing corpus, not just new ingests. Tension
  detection reading a corpus that's half-tagged is the failure this whole gate
  exists to prevent.

Only then: `plans/emergence-feed.md`, `plans/interest-profile.md`, and
eventually tension detection and `plans/paper-entity.md`.

## Local-model fit

Strong fit — this plan is mostly pure functions. The tag normalizer and
edit-distance matcher, URL normalization extensions, the cosine-threshold
clustering pass, and all their vitest suites are good local-model work. Keep
on Claude/Pi: the vocabulary-store table decision, the backfill's live-AWS
paging, and the tagging prompt.
