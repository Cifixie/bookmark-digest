# File-upload ingestion (HTML / PDF)

**Status:** proposed — not started.

**Goal:** let a user hand over the page they already have (saved HTML, printed
PDF) instead of asking Firecrawl to re-fetch it, so link targets and content
survive intact when Firecrawl's remote extraction drops them.

## Why this exists

Digest `a0045eb3-be0c-4809-8f42-f672ed627332` (`summary`, gemini-3.6-flash,
source `contentHash 0d316f6b71251a6238650ae942b2c052f7da2583a2b3d6d6ea9bd555c0084510`)
failed validation:

```
Validation failed: [LinkItem src-1]: href: Invalid URL; [LinkItem src-2]: href: Invalid URL; ...
```

The source is a Medium article whose "Sources" footer lists five citations as
`Title — Publisher` with no clickable link in the fetched text — Firecrawl's
markdown extraction (`onlyMainContent: true`, see `apps/infra/lambdas/ingest-url/handler.ts`)
dropped the `href`s from that citation list, though it normally renders links
as `[text](url)`. The model, following `GROUNDING_RULES`'s instruction to only
build a `LinkItem` from a link the material itself points the reader to,
tried to represent the citations anyway and fabricated a placeholder `href`,
which `LinkItem.props.href` (`z.string().url()`) correctly rejected.

An immediate mitigation is in: `GROUNDING_RULES` in `apps/infra/lib/digest-goals.ts`
now tells the model to render a named-but-unlinked source as plain text
instead of a `LinkItem` when the material carries no real URL for it. That
stops this exact failure mode, but it doesn't recover the citations — the
links are still gone, because Firecrawl never had them by the time the model
saw the content. This is the same shape of problem as
`plans/thin-source-detection.md`'s YouTube case: a remote scraper losing
information a human looking at the same page would clearly see.

The `"manual"` content-paste path (`fetchSource` in `ingest-url/handler.ts`)
already exists as an escape hatch — paste text in, skip Firecrawl entirely —
and is currently used for the reverted YouTube-transcript case. A file upload
is the same escape hatch for the case where the user has the rendered page
(saved HTML, or a PDF export) and Firecrawl's remote fetch is the thing
losing fidelity, not the source itself.

## Scope

In scope: HTML and PDF upload as a third ingestion path, alongside URL fetch
(Firecrawl) and manual text paste. Both formats can carry real link targets
that survive local extraction, which is the specific gap this closes.

Out of scope: image upload (screenshots, photographed pages). No links to
preserve, and it needs a vision/OCR pass rather than text extraction — a
different feature with its own design questions. Noted as a future idea, not
folded in here.

## Design

### Extraction

- **HTML** — parse with `cheerio` (already the candidate named in
  `plans/phase-1-execution.md` section 4.1 before the team went all-in on
  Firecrawl). Walk the DOM, emit markdown-ish text with `[text](href)` for
  anchors, resolving relative `href`s against a `baseUrl` the caller supplies
  (a saved HTML file has no origin of its own). `@mozilla/readability` first,
  to strip chrome the same way `onlyMainContent` does for Firecrawl, then
  convert the cleaned DOM.
- **PDF** — parse with `pdf-lib` or `pdfjs-dist` for text, and pull link
  annotations (`Link` subtype in a PDF's `/Annots`) separately since a PDF's
  visible text and its clickable regions are stored independently, unlike
  HTML anchors. Splice the annotation URLs back in near the text they
  overlap, best-effort — PDF layout has no clean text-to-link binding the way
  a DOM does, so this will not be exact.

Both paths are **local**, unlike the Firecrawl path — no external API call,
so no equivalent of "Firecrawl returned a 4xx" failure mode, but also no
`onlyMainContent` heuristic to lean on, so chrome-stripping quality is on us
(`@mozilla/readability` for HTML; PDFs mostly don't have chrome to strip).

### API surface

`POST /sources` currently takes `{ url, content?, contentType? }`
(`ingest-url/handler.ts:118-129`). Add a fourth field, e.g. `{ file: { base64, mimeType } }`,
mutually exclusive with `content` (both are "I already have this, don't
fetch" — same branch as `pasted`, just with a different input shape).
`fetchedBy` becomes `"upload-html"` / `"upload-pdf"` so a bad extraction is
traceable to the fetcher that made it, matching how `"manual"` and
`"firecrawl"` are already distinguished on the stored row.

Payload size: API Gateway's 10 MB request-body ceiling comfortably covers a
saved HTML page or a text-heavy PDF; large image-heavy PDFs could hit it — if
that turns out to matter, route through a presigned S3 upload instead of
inline base64, the same pattern already used elsewhere in this repo for large
uploads (`get_presigned_url` in the AWS MCP tooling docs `staging_sources`
convention is the closest existing analogue, not code in this repo — there is
no existing S3-upload path in `ingest-url` to reuse yet).

The web app's existing "Paste text instead of fetching" box
(`plans/thin-source-detection.md` line 37) is the natural place to add a file
picker next to it — same escape-hatch affordance, different input.

### Where the code goes

- `apps/infra/lambdas/ingest-url/handler.ts` — new `fetchFromUpload()` beside
  `fetchWithFirecrawl()`, dispatched from `fetchSource()` alongside the
  existing `pasted` branch.
- New `apps/infra/lib/extract-html.ts` and `apps/infra/lib/extract-pdf.ts` for
  the parsing logic, kept out of the handler so they're independently
  testable (the handler currently has no local extraction code to split out
  of — this would be the first).
- `packages/schemas/src/index.ts` — extend the `POST /sources` request shape
  with the new `file` field.
- `apps/infra/lib/config.ts` — a size ceiling constant if going the inline
  base64 route, mirroring `FIRECRAWL_API_URL`'s placement.

### Open questions

- Does a PDF's link-annotation-to-text splicing need to be exact, or is
  "links present somewhere near their citation" good enough for the model to
  work with? Given `GROUNDING_RULES` already tells the model to only use a
  link it's confident points where it says, approximate splicing that's
  sometimes wrong is worse than no splicing that's honestly absent — needs a
  real PDF sample to judge, not a guess.
- `cheerio` vs `@mozilla/readability` vs both, as in extraction — start with
  both (`readability` to strip chrome, `cheerio` to walk the cleaned result
  for anchors), since that mirrors what Firecrawl already does successfully
  for most sources.

## Cleanup owed

None yet — this is unstarted. When the immediate `GROUNDING_RULES` mitigation
lands (already applied, see above), the failed digest
(`a0045eb3-be0c-4809-8f42-f672ed627332`) is not automatically retried; it
stays `status: "failed"` unless the user regenerates it. No stale-row cleanup
is needed the way `thin-source-detection.md` needed it, because the source
row (`0d316f6b...`) is `status: "ready"` and correctly reflects what Firecrawl
actually returned — it isn't wrong, just incomplete. Re-ingesting it via file
upload once this ships would create a **second** source row (a different
`contentHash`, since the content differs), not replace this one.
