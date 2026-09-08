# Current work

- **Phase 2/3 pivot — two-fork architecture** (2026-09-03, planning complete,
  no code yet) — the project pivoted from "the rendered digest pipeline is the
  product" to a two-fork architecture. **Fork A** (Sediment: ingestion
  substrate, SourceHealth, tagging, embeddings, Source-level TL;DR, emergence,
  recall) is primary and gets engineering priority. **Fork B** (everything
  shipped: the two-axis block catalog, `registry.tsx`, the json-render Spec
  tree, `digestGoal`/`sourceMode`, `DigestMeta`, Explore-agent) is secondary
  and **kept, not retired** — two earlier drafts of the pivot assumed
  retirement and are superseded. The two are joined by one deliberate bridge:
  the Source-level TL;DR and the deterministic extraction structure
  (`KeyPoints`/`Statistics`/`QuoteBlocks`/`Themes`) are computed **once, on the
  Source** and read by both forks, which is what lets Fork B degrade
  gracefully instead of rotting while Fork A has the attention. Data model
  settled: **S3 as source of truth** for raw + extracted content keyed by
  `contentHash`, three fork-scoped DynamoDB tables (Sources = Fork A index,
  Digests = Fork B output, future Papers), no single-table migration.

  Raw input was `raw/HANDOFF.md` (unmaintained — processed, don't work off it).
  Produced: `docs/two-fork-architecture.md` (structural reference — read this
  first), a rewritten `plans/ROADMAP.md`, six new plans
  (`s3-source-of-truth`, `extraction-and-tldr`, `source-health`,
  `substrate-tagging-and-dedup`, `emergence-feed`, `interest-profile`),
  `plans/paper-entity.md` (parked, schema decided in advance),
  `plans/prior-art.md`, and the "Phase 2/3 pivot" section of [[decisions]].

  Two questions the handoff left open were resolved in the plans: the S3
  transition **runs alongside inline content** behind one accessor, then
  backfills, then drops the inline copy (a cutover would rebuild the
  "can't wait for backfill" trap that killed the native vector index); and
  file upload is **pulled forward** into SourceHealth v1, since it's the
  recovery arm of the detection SourceHealth adds.

  Two handoff claims were corrected against the repo: there is **no pending
  Next.js → Vite migration** (`apps/web` is already Vite + react-router; the
  Next-style `page.tsx` naming under `src/app/` is a cosmetic leftover), and
  file upload was **never volume-gated** (only the statistical thin-fetch
  layer is). See [[decisions]].

  **Next:** queue item 1, `plans/s3-source-of-truth.md`.

- **Ingestion — push-source CLI** (2026-09-02, in progress) — a CLI to push
  sources without the web app: `apps/infra/scripts/push-source.ts`
  (`npm run push-source`), four subcommands. `extract <url> [--out <file>]`
  fetches a YouTube transcript into a .md (default: a timestamped file in the
  cwd, absolute path printed to stdout). `create <file> --url <url> [--content-type
  <type>]` POSTs the file's contents to `POST /sources`. `login` forces a fresh
  Cognito login; `logout` clears the cached token. The YouTube logic was pulled
  out of `scripts/youtube-transcript.ts` into `lib/youtube.ts` — an `any`-free,
  nested-guarded `isInnerTubePlayer` narrows the untrusted InnerTube JSON, and
  the standalone script now imports it — so `extract` and the script share one
  code path. Auth lives in `lib/cognito-auth.ts` and uses the dedicated CLI
  Cognito client (`bookmark-digest-stack.ts` `CliClient`, `password: true`,
  `CfnOutput` `CliUserPoolClientId`): email/password login, token cached at
  `~/.config/bookmark-digest/cognito-token.json` (0600, written after a
  `mkdir -p`), refreshed silently via the refresh token and only re-prompting
  for the password. `create` sends the **bare** idToken in `Authorization` (no
  `Bearer ` prefix — see [[gotchas]]) plus `{ url, content, contentType }`, prints
  the `{ sourceHash, status }` response. `main()` wraps the dispatch in try/catch and `await`s the async handlers so
  a missing field prints a one-line error rather than a Node stack trace. The
  API base URL and CLI client id are read from `apps/infra/outputs.json` via
  `lib/stack-outputs.ts` (`pnpm outputs` regenerates it after each deploy);
  `BKDG_CLIENT_ID`/`BKDG_REGION` env vars are optional overrides, so nothing is
  injected by hand. `pnpm typecheck` clean and config-resolves-from-outputs.json
  smoke-tested. **Remaining:** end-to-end `login` → `extract` → `create` →
  `POST /sources`.

- **Source quality — thin-fetch detection (Part A)** (completed 2026-09-01) —
   detects sources whose Firecrawl fetch returned page chrome rather than
   content. New pure function `detectThinFetch()` in `apps/infra/lib/thin-fetch.ts`
   (first ~1,000 chars only; `That's an error` alone, or 2+ of `Skip navigation`/
   `Show transcript`/`Sign in`, after normalizing curly apostrophes to ASCII).
   Wired into `runGeneration` (`generate-digest/handler.ts`): after the
   `missing.length` check and **before** `status: "generating"` — the last point
   before quota is spent — each thin source is marked `status: "thin"` (a new
   `sourcesUpdate` import) so the ingest dedup treats it as re-fetchable, the
   digest fails with a specific, user-facing error naming the source (not the
   generic "Internal error during generation"), and the trigger metrics are
   logged to seed Part B's labelled corpus. `thin` added to the `sourceStatus`
   schema enum and the Browse source filter + badge colors (`--badge-thin`
   tokens already existed); embed-source skips non-`embedding` stream events, so
   the chrome is never re-embedded. `thin-fetch.test.ts` (vitest) covers the
   fixture, the error page, the weak-marker threshold, and the 1,000-char
   boundary. Part B (a statistical signal-density threshold) stays gated on
   ~50 sources / ~10 known-bad before it's worth fitting. See the merged
   `plans/source-quality-and-upload.md` and [[decisions]].
- **Ingest — resolve redirect/shortener URLs** (completed 2026-08-25) —
  `ingest-url` now resolves the submitted URL before dedup and Firecrawl
  fetch, via new `apps/infra/lib/resolve-url.ts`. Two steps: unwrap
  `google.com/url?q=...` (query-param wrapper, not a real HTTP redirect),
  then follow real HTTP redirect chains (`fetch` with `redirect: "follow"`,
  HEAD falling back to GET) — this second step alone also fully resolves
  `share.google/<id>` links, confirmed by hand (`share.google/<id>` → 302 →
  `google.com/share.google?q=<id>` → 302 → target; every hop is a real
  3xx). Fails open to the original URL on any error/timeout. `apps/infra`
  had no test suite at all before this (`test` script was a placeholder
  `echo`); added vitest (matches `packages/catalog`'s setup) with
  `lib/resolve-url.test.ts` covering plain/redirect/google-wrapper/
  HEAD-fails-GET-succeeds/fail-open cases. No schema or DynamoDB item
  shape changes — the original as-submitted URL is discarded, not stored.

- **Android share target — share-result feedback** (completed 2026-08-25) —
  Bug: after sharing a link, the user got no feedback when the save finished
  or failed. Root cause: `IngestWorker` reported results via `Toast`, but
  Android 10+ silently swallows background toasts, and the app is in the
  background by the time the POST returns (10-30s Firecrawl scrape). Only
  `ShareActivity`'s foreground toasts ("Saving…", "No link found") were ever
  visible.

  Fix: share state is now a notification. New `IngestNotifications` object
  posts an ongoing "Saving…" notification when the share is enqueued
  (notification id = `url.hashCode()`) and replaces it in place with the
  terminal state (Saved / Already saved / Couldn't fetch that page / Failed
  to save / Sign in to save links). The Unauthorized notification carries a
  `PendingIntent` that opens `LoginActivity` — a notification can launch an
  activity from the background (a worker cannot), which removes the
  documented "user has to open the app from the launcher themselves" cost.
  `IngestWorker`: toasts → notifications; `Retryable` is now bounded at 3
  attempts and posts "Failed to save" when they exhaust. `LoginActivity`
  requests `POST_NOTIFICATIONS` (Android 13+) while open; `ShareActivity`
  falls back to its "Saving…" toast when that permission is not granted
  (otherwise the notification is dropped and the share would be silent).
  Touched: `apps/mobile/android/app/src/main/java/com/bookmarkdigest/share/`
  (`IngestNotifications.kt` new, `IngestWorker.kt`, `ShareActivity.kt`,
  `ShareApp.kt` channel creation, `LoginActivity.kt`), `AndroidManifest.xml`
  (POST_NOTIFICATIONS), `res/values/strings.xml` (new `state_*` +
  `channel_share` strings; `toast_saved`/`toast_already_saved`/
  `toast_sign_in_required`/`toast_fetch_failed`/`toast_failed` removed),
  `res/drawable/ic_notification.xml` (new bookmark icon).

  Two missing imports (`android.Manifest`/`android.content.pm.PackageManager`
  in `IngestNotifications.kt`, `android.os.Bundle` in `LoginActivity.kt`)
  failed the first build; fixed, then built, installed on the Pixel 10, and
  verified on-device across all three terminal states (Saved, fetch failure,
  sign-in-required tapping through to `LoginActivity`). Wiki updated:
  [[gotchas]] (background toasts silently swallowed on Android 10+),
  [[decisions]] (the sign-in "user has to open the app themselves" cost is
  gone — notifications can launch activities), app README (notification is
  now the UI, not a toast).

- **Dark theme — color migration** (completed 2026-08-13) — replaced all
  hardcoded hex colors in TSX components with CSS variables. Added 40+ new
  variables to `styles.css`: code block colors, chart palette, callout
  variant colors, utility borders, and semantic accents. Components updated:
  DigestHero, DigestFooter, SourceMeta, DigestPage, CodeBlock, Chart, Step,
  Terminal, Callout, StatCard, TimelineEvent, AuthorCard, QuoteBlock, List,
  ComparisonNarrative, GlossaryTerm, TLDR, Prose.

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

- **bookmark-digest audit fixes** (completed 2026-08-14) — P0: search-digests now shows `synopsis`-truncated or goal+date label instead of `undefined` title for multi-source digests; added `sourceHashes` projection so `multiSourceCount` renders correctly. P1: removed dead `matchTag` import and zero-width-space artifact in generate-digest console.warn. P2: `registry as any` gaps left as-is (non-blocking cosmetic).

## What remains

Planning was restructured again 2026-09-03 for the two-fork pivot — see
`docs/two-fork-architecture.md` for where work goes and `plans/ROADMAP.md` for
the queue. Old phase-N docs are archived at `plans/archive/`; durable
reasoning lives in [[decisions]] and [[gotchas]].

**Fork A queue, in order:**

1. `plans/s3-source-of-truth.md` — S3 canonical for raw + extracted content.
2. `plans/extraction-and-tldr.md` — the fork bridge. Get it right once.
3. `plans/source-health.md` — generalize `detectThinFetch()`; includes file
   upload, pulled forward.
4. `plans/substrate-tagging-and-dedup.md` — **hard gate.** Nothing below
   starts before this backfills.
5. `plans/emergence-feed.md` — first genuinely Sediment surface.
6. `plans/extraction-to-fork-b.md` — point Fork B at the bridge.
7. `plans/interest-profile.md` — derived view; its key-scoping requirement
   lands during items 1 and 3, not at item 7.

In parallel whenever convenient: finish the push-source CLI end-to-end (top
of this file); share-sheet PWA if wanted, re-scoped as a third client on the
proven `POST /sources` contract.

**Fork B, unchanged and unretired:** `plans/explore-agent.md` (still the
unbuilt capstone, no retargeting needed) and the historical record in
`plans/digest-metadata-completeness.md` ✅, `plans/suggested-bundles.md` ✅,
`plans/source-detail-page.md` ✅, `plans/source-quality-and-upload.md`
(Part A ✅, forward half now `plans/source-health.md`).

Deferred-with-a-trigger: `plans/multi-catalog-gating.md` (un-cancelled by the
pivot — rendering isn't being retired), the statistical thin-fetch threshold,
and `webclaw` (`plans/prior-art.md`). Parked without a trigger:
`plans/PARKED.md`. Parked with an unblock condition:
`plans/paper-entity.md`.
