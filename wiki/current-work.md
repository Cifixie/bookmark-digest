# Current work
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

Planning was restructured 2026-08-12 — see `plans/ROADMAP.md` for the full
picture. The old phase-N docs are archived at `plans/archive/`; durable
architectural reasoning pulled out of them lives in [[decisions]] and
[[gotchas]]. Queue, in order:

1. `plans/digest-metadata-completeness.md` — **Steps 1–4 done** (multi-source `DigestMeta` with subject/tags/synopsis).
2. `plans/suggested-bundles.md` — done (shared `inferSourceMode` heuristic, related sources fetch + "Generate digest from related sources" button on both Source and Digest detail pages).
3. `plans/source-quality-and-upload.md` — thin-fetch detection + HTML/PDF
   upload recovery.
4. ~~`plans/source-detail-page.md`~~ — done 2026-08-13.
5. `plans/explore-agent.md` — capstone, deliberately last and
   underspecified.

Deferred-with-a-trigger: `plans/multi-catalog-gating.md`. Parked without a
trigger: `plans/PARKED.md`.
