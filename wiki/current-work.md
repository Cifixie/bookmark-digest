# Current work

- **Phase-3 Browse/Search** (completed 2026-08-12) — title capture on ingest,
  `list-sources`/`fetch-digest` filters, `/browse` page (Sources/Digests
  toggle, structural filter + substring search), semantic search
  (`GET /sources/search`), and `DigestMeta` generation (subject/tags/etc. for
  single-source digests). See [[gotchas]] for two bugs found and fixed during
  review of the first pass at this (dead API route, broken DynamoDB update).

## What remains

- No source detail page — Browse's source rows link out to the original URL
  instead (`plans/phase-3-browse-search.md` flagged this as TBD).
- `DigestMeta` generation only runs for single-source digests; multi-source
  bundles never get `subject`/`tags`.
- Self-expanding tag vocabulary (`TagsTable`) — designed in the phase-3 plan,
  not built.
- **Phase-2d**: suggested-bundle UX (from phase-2-scope.md step 5) — depends
  on `RelatedFromYourBookmarks`.
- **Phase-4**: "Explore this" — agent that adds content based on browsing
  patterns.
