# "Explore this" — agent-driven topic exploration

**Status:** vision/stub — deliberately the least specified plan in the
queue. Item 5 (capstone) in `plans/ROADMAP.md`'s queue. Do not start until
items 1-4 have shipped and been dogfooded.

## The idea

Given a topic or query instead of a URL, an agent plans → searches the web →
fetches candidate sources → hands off to the *existing* multi-source
generation capability. First named in `plans/archive/phase-2-scope.md` as
"the largest, riskiest item — best tackled once multi-source generation
itself is proven with a human-curated source set." That condition has since
been met (Milestone 1 shipped and dogfooded multi-source generation) — but
the queue items ahead of this one (metadata completeness, suggested bundles,
source-quality detection/recovery, source detail page) all make the
ingestion → generation → browse loop this agent would drive more solid.
Building the agent on top of a shaky loop just means it fails in more places
at once.

## Why this is deliberately underspecified right now

Every other plan in this queue could point at a concrete failing digest, a
concrete missing field, or a concrete unimplemented endpoint. This one
can't — nothing has been attempted yet, so there's no real failure mode to
design around. Writing detailed steps now would be guessing at a shape that
should come from actually trying it, the same reasoning `thin-source-
detection.md`'s Part B used for not fitting a threshold to one data point.

## What's already reusable (confirmed, not guessed)

- Multi-source generation (`sourceHashes[]` in, one digest out) — done,
  dogfooded, handles `sourceMode` axis correctly.
- Ingestion pipeline (`POST /sources`, Firecrawl fetch, dedup, embed) — done,
  and by the time this is picked up should also have the upload/manual
  escape hatches from `plans/source-quality-and-upload.md` for sources a web
  search turns up that Firecrawl mishandles.
- `DigestMeta`/tag vocabulary (once `plans/digest-metadata-completeness.md`
  ships) — gives the agent's output the same browsable/searchable metadata
  as human-curated digests, rather than a second-class result.

## What genuinely needs deciding when this is picked up (not now)

- **Search backend** — a web-search API integration this repo doesn't have
  yet. Which one, and what it costs, is a real decision, not a detail to
  wave at.
- **Planning loop shape** — how many sources does the agent fetch before
  generating? Does it re-plan after seeing what it fetched (e.g. abandon a
  bad source, fetch one more)? This is the one part of the whole pipeline
  that has genuine branching/uncertainty — contrast with [[decisions]]'s
  note that the *existing* generation pipeline deliberately avoided an
  agentic loop because there was no real uncertainty in its steps. Here
  there is, which is exactly why an agent framework is the right tool for
  *this* piece and wasn't for the rest.
- **Cost/quota exposure** — this is the first feature where one user action
  can trigger an unbounded number of fetches + generation calls. Needs an
  explicit cap (max sources fetched, max total generation calls per
  "explore" request) decided deliberately, not discovered from a runaway
  bill.
- **Trust/review surface** — does the user see and approve the source list
  before generation, or is it fully autonomous? Given `GROUNDING_RULES`
  already exists because models invent content confidently from thin
  material, autonomous source *selection* (not just autonomous source
  *summarization*) is a new place for that failure mode to hide, and
  probably wants a human checkpoint at least for v1.

## Local-model fit

Not yet assessable — the shape of the work isn't decided. Revisit once the
planning-loop design exists; a search-result-ranking or source-relevance-
scoring subtask is a plausible local-model fit once it's concretely scoped,
but guessing that now would be premature.

## When to actually start

After items 1-4 in `plans/ROADMAP.md` ship. Re-read this file and replace
it with a real plan at that point — this version is a placeholder marking
*that the capstone exists and why it's last*, not something to implement
as written.
