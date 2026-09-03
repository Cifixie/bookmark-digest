# Source quality: detect thin fetches, recover via upload

**Status:** Part A (fetch-failure markers) **shipped 2026-09-01** — pure
`detectThinFetch()` in `apps/infra/lib/thin-fetch.ts`, wired into
`runGeneration` to mark thin sources `status: "thin"` and fail the digest with
a specific, user-facing error before any quota is spent; `thin` added to the
`sourceStatus` schema enum and the Browse source filter + badge colors, with a
vitest suite (`thin-fetch.test.ts`). Part B (signal-density threshold) stays
gated on a labelled corpus; the YouTube-scrape finding (`GROUNDING_RULES`
only) remains as background.

**⚠️ Superseded going forward (2026-09-03).** This doc is now the historical
record of how thin-fetch detection was built and why. The unbuilt half
continues in **`plans/source-health.md`** (Fork A), which generalizes
`detectThinFetch()` into an ongoing `health` field with periodic recheck,
paywall flagging, and override paths — and which **pulls file upload
forward** rather than leaving it queued. Note the naming confusion this doc
caused: it labels *two* different sections "Part B" (signal-density scoring,
which is corpus-gated, and file-upload ingestion, which never was). See
[[gotchas]]. For where this fits now, see `plans/ROADMAP.md` item 3.

**Supersedes:** `thin-source-detection.md` and `file-upload-ingestion.md`
(merged — see "Why merged"). If looking for either by name, this is where
they live now.

## Why merged

Both plans are the same underlying problem from two ends: a remote fetch
(Firecrawl) sometimes returns page chrome instead of content, or silently
drops real link targets, and the source material itself is fine — the fetch
is what's broken. Thin-source-detection is the *detect* half ("this fetch
didn't get real content, don't spend a generation request on it").
File-upload-ingestion is the *recover* half ("let the user hand over the
page directly so the fetch isn't the bottleneck"). Sequencing them together
means the detection layer can point at the recovery path directly
("this looks thin — try pasting or uploading the file instead") instead of
just failing.

## Part A — Detection (shippable now, no data dependency)

### Background

Digest `80984bad-a27f-4368-9cd1-00d31084d42f` was generated from a Firecrawl
scrape of a YouTube watch page: 13,556 characters of nav/error-banner/
sign-in/view-counts, no transcript. The model produced a complete, confident,
well-shaped page anyway — five invented principles, a StatCard built from
view/like counts, a "Related Talks" section from the sidebar. It validated
cleanly and stored as `done`.

Two of three fixes are in:
1. **YouTube-specific ingestion** — tried in-Lambda (InnerTube caption
   endpoint), reverted: works from a residential IP, silently returns no
   captions from Lambda's shared IP ranges. Survives as a local CLI
   (`apps/infra/scripts/youtube-transcript.ts`) feeding the manual-paste
   path (`fetchedBy: "manual"`).
2. **`GROUNDING_RULES`** (`apps/infra/lib/digest-goals.ts`) tells the model
   page furniture isn't content and reporting thin material is an
   acceptable output. Helps, but asks a model that's already inadequately
   grounded to self-report — exactly the thing it's bad at.

This section (fetch-failure markers) is the third, and the one substep of
detection actually worth shipping now.

### Why signal-density scoring is deferred, not built

Measured across all 11 stored sources at the time this was written, the one
known-bad source and a known-good article are adjacent on every metric
(64.1% vs 63.3% link density, 0.145 vs 0.141 words/char, comparable length).
Any threshold catching the bad one rejects the good one. Word density is
flat (0.135–0.189) across the whole corpus and carries no signal at all. A
length floor alone doesn't separate them either. **Do not fit a threshold
to fewer than ~50 sources with at least ~10 known-bad** — sample size is 1
known-bad case, which is not enough, and a false positive here (blocking a
digest the user asked for) is worse than the current false negative (a
generation the user can inspect and delete).

### What to build now — fetch-failure markers

Substring matching for evidence the fetch didn't get the article, checked
near the **start** of content only (first ~1,000 chars — an article *about*
error handling will contain error strings in its body, so anywhere-in-doc
matching would false-positive):

```
"That's an error"      (note: U+2019 apostrophe, not ASCII — normalize before matching)
"Skip navigation"
"Show transcript"
"Sign in"
```

`"Sign in"` / `"Show transcript"` are weaker signals alone (an article could
quote UI copy) — prefer requiring two-or-more markers, or weight
`"That's an error"` alone as sufficient.

**Behavior on detection:** don't silently fail the digest — the source is
what's broken, not the request.
- Mark the source row `status: "thin"` with a reason, distinguishable from
  `ready`, re-fetchable by a better method later.
- Fail the digest with a specific, user-facing error naming the source and
  reason (not the current generic "Internal error during generation").
- Surface a re-fetch affordance in the web app — and once Part B ships,
  point it at the upload path specifically.
- Log the metrics that triggered it, building the labelled corpus Part B
  needs.

**Where the code goes:** `runGeneration` in
`apps/infra/lambdas/generate-digest/handler.ts`, immediately after the
existing `missing.length > 0` check and **before** the `status: "generating"`
update — the last point before quota is spent. The existing `MIN_ELEMENTS`/
`isThin` check further down stays separate and unchanged: thin output from
rich material is a model problem, thin output from thin material is an
ingestion problem, and conflating them hides which one occurred.

**Local-model fit: high.** The substring matcher is a pure function with a
fixed marker list and no AWS dependency — a clean Qwen task, including its
unit tests against the known corpus (the bad-source content is preserved at
`docs/references/thin-sources/youtube-watch-page-scrape.md`).

### Part B — signal-density scoring (deferred, needs data)

Instrument every generation to log the metrics above (chars, link%, words/
char, line-count, median-line-length) regardless of outcome, and label
outcomes (a digest the user deletes/regenerates, or that fails validation,
is a weak "bad source" signal). Revisit fitting a threshold once the
labelled set is large enough to check separability — not before. Candidate
untested features, most promising first: **positional link-density**
(concentrated in one region vs. spread through the body — the YouTube
chrome front-loads links, an article distributes them), repeated-line
ratio, longest-paragraph-to-median ratio.

### Cleanup owed (from the original finding)

Source `contentHash 7d061702b6ac82745119f6d73876c0acfd2d5dc6a360370f4b3603059f8933ca`
and digest `80984bad-a27f-4368-9cd1-00d31084d42f` are still `status: "ready"`/
stored in DynamoDB. Both need deleting to re-ingest via a better path — the
content is already preserved at the docs path above (the only labelled bad
example, needed for Part B), so deletion is safe.

---

## Part B (of the merged plan) — File-upload ingestion (HTML/PDF)

### Background

Digest `a0045eb3-be0c-4809-8f42-f672ed627332` failed validation
(`[LinkItem]: href: Invalid URL`) because Firecrawl's markdown extraction
dropped `href`s from a Medium article's citation footer — the model,
following `GROUNDING_RULES`, tried to represent the citations anyway and
fabricated placeholder hrefs, correctly rejected by
`LinkItem.props.href`'s `z.string().url()`. `GROUNDING_RULES` was updated to
render a named-but-unlinked source as plain text instead — stops the
validation failure, doesn't recover the actual citations, since Firecrawl
never had them.

### Scope

In scope: HTML and PDF upload as a third ingestion path alongside URL fetch
and manual paste — both formats can carry real link targets that survive
local extraction. Out of scope: image upload (screenshots) — no links to
preserve, needs vision/OCR rather than text extraction; noted in
`plans/PARKED.md`, not folded in here.

### Design

- **HTML** — `@mozilla/readability` first to strip chrome (mirrors
  Firecrawl's `onlyMainContent`), then `cheerio` to walk the cleaned DOM,
  emitting `[text](href)` for anchors, resolving relative hrefs against a
  caller-supplied `baseUrl` (a saved HTML file has no origin of its own).
- **PDF** — text via `pdf-lib`/`pdfjs-dist`; link annotations (`Link`
  subtype, `/Annots`) pulled separately since a PDF's visible text and its
  clickable regions aren't bound together the way DOM anchors are. Splice
  annotation URLs back near overlapping text, best-effort — PDF layout has
  no clean text-to-link binding, so this won't be exact. **Open question,
  needs a real PDF sample to judge, not a guess:** is approximate splicing
  (sometimes wrong) better or worse than no splicing (honestly absent),
  given `GROUNDING_RULES` already tells the model to only use a link it's
  confident about?

Both paths are local — no external API call, so no "Firecrawl returned 4xx"
failure mode, but also no `onlyMainContent` heuristic to lean on; chrome-
stripping quality is on us.

### API surface

`POST /sources` currently takes `{ url, content?, contentType? }`. Add a
fourth field, e.g. `{ file: { base64, mimeType } }`, mutually exclusive with
`content` — same "don't fetch, I already have this" branch as the existing
`pasted` case, different input shape. `fetchedBy` becomes `"upload-html"` /
`"upload-pdf"` so a bad extraction is traceable to its source, matching how
`"manual"`/`"firecrawl"` are already distinguished.

Payload size: API Gateway's 10 MB body ceiling covers a saved HTML page or
text-heavy PDF comfortably; large image-heavy PDFs could hit it — if that
turns out to matter, route through a presigned S3 upload instead of inline
base64 (no existing precedent for this in the repo yet; would be the first).

The web app's existing "paste text instead of fetching" affordance is the
natural place to add a file picker alongside it.

### Where the code goes

- `apps/infra/lambdas/ingest-url/handler.ts` — new `fetchFromUpload()`
  beside `fetchWithFirecrawl()`, dispatched from `fetchSource()` alongside
  the existing `pasted` branch.
- New `apps/infra/lib/extract-html.ts`, `apps/infra/lib/extract-pdf.ts` —
  kept out of the handler so they're independently testable (first local
  extraction code in this Lambda — nothing to split out of yet).
- `packages/schemas/src/index.ts` — extend `POST /sources` request shape
  with `file`.
- `apps/infra/lib/config.ts` — size ceiling constant if going inline-base64.

### Cleanup owed

None yet — unstarted. The failed digest above stays `status: "failed"`
unless regenerated; re-ingesting via file upload once this ships creates a
**second** source row (different `contentHash`), not a replacement — the
existing row correctly reflects what Firecrawl actually returned, it's
incomplete, not wrong.

## Local-model fit (Part B)

Medium-high. `extract-html.ts`/`extract-pdf.ts` are self-contained parsing
modules with no AWS dependency, good Qwen candidates including unit tests
against sample files. Keep the Lambda dispatch wiring and the schema/API
surface change with Claude/Pi — that's the part that touches the shared
request contract.

## Verify

```bash
pnpm --filter infra typecheck
pnpm --filter web typecheck
pnpm --filter schemas typecheck
```
