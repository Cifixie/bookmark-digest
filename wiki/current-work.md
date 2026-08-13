# Current work

- **Phase-3 Browse/Search** (completed 2026-08-12) — title capture on ingest,
  `list-sources`/`fetch-digest` filters, `/browse` page (Sources/Digests
  toggle, structural filter + substring search), semantic search
  (`GET /sources/search`), and `DigestMeta` generation (subject/tags/etc. for
  single-source digests). See [[gotchas]] for two bugs found and fixed during
  review of the first pass at this (dead API route, broken DynamoDB update).
- **Source detail page** (`/sources/:contentHash`, completed 2026-08-13)
  — replaces external link in Browse with in-app source view showing
  metadata, extracted content, "Open original ↗", list of generated
  digests, and a "Related from your bookmarks" panel. Frontend-only, no
  CDK/IAM changes (reuses existing `GET /sources/{sourceHash}`, `GET
  /digests?sourceHash=`, and `GET /sources/{sourceHash}/related`). Found
  along the way: `DigestPage`'s `RelatedFromYourBookmarks` was a dead
  placeholder never wired to real data — the source page bypasses it and
  calls the related-sources endpoint directly instead (see
  `plans/source-detail-page.md`).

## What remains

Planning was restructured 2026-08-12 — see `plans/ROADMAP.md` for the full
picture. The old phase-N docs are archived at `plans/archive/`; durable
architectural reasoning pulled out of them lives in [[decisions]] and
[[gotchas]]. Queue, in order:

1. `plans/digest-metadata-completeness.md` — multi-source `DigestMeta`,
   tag-vocabulary fuzzy matching, digest synopsis + semantic search, model
   tiering off Gemini's quota.
2. `plans/suggested-bundles.md` — unblocked, unstarted.
3. `plans/source-quality-and-upload.md` — thin-fetch detection + HTML/PDF
   upload recovery.
4. ~~`plans/source-detail-page.md`~~ — done 2026-08-13.
5. `plans/explore-agent.md` — capstone, deliberately last and
   underspecified.

Deferred-with-a-trigger: `plans/multi-catalog-gating.md`. Parked without a
trigger: `plans/PARKED.md`.
