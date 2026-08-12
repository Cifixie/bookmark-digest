# Thin-source examples

Labelled examples of source material that cannot support a digest. These exist to
calibrate the detection described in `plans/thin-source-detection.md`, which is
deferred precisely because there are not yet enough of them to fit a threshold to.

Add to this directory whenever a digest turns out to have been generated from
inadequate material. One file per source, content verbatim as stored in the
Sources table, with the provenance recorded below.

## `youtube-watch-page-scrape.md`

- **URL:** `https://www.youtube.com/watch?v=8FSLsVAJj2w`
- **Stored as:** `contentHash 7d061702b6ac82745119f6d73876c0acfd2d5dc6a360370f4b3603059f8933ca`
- **Fetched by:** `firecrawl`, 2026-08-12
- **Size:** 13,556 chars — 64.1% of characters inside markdown link syntax
- **Produced:** digest `80984bad-a27f-4368-9cd1-00d31084d42f` (`summary`)

A Firecrawl scrape of a YouTube watch page. Contains a `401` banner, nav, "Sign
in", the un-clicked `Show transcript` button, view/like counts, and the
recommendation sidebar. Does not contain the talk.

The digest it produced invented five principles with confident titles, built a
StatCard row from the view and like counts, and built a "Related talks" section
from the sidebar. It passed validation.

For contrast, the same video via the transcript fetcher added in
`apps/infra/lib/youtube.ts` yields 59,217 chars of actual speech:

```
node apps/infra/scripts/youtube-transcript.mjs "https://www.youtube.com/watch?v=8FSLsVAJj2w"
```

The human-written reference summary of this same talk is at
`docs/references/summaries/modern-ui-patterns-css-day-2026-summary.html` — useful
as the target quality bar when regenerating.
