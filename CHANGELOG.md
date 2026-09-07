# Changelog

## Unreleased

### Added

### Changed

### Fixed

## [1.0.0] - 2026-09-03

### Added

- Two-axis content catalog with 25 LLM-authored block types and 1 structural block (`SectionContainer`) in `@bookmark-digest/catalog` (`packages/catalog/src/index.ts`)
- json-render native Spec tree output (root + keyed elements, RFC-6902 patch-compiled) replacing flat `DigestBlock[]` array (`packages/catalog/src/page/`)
- Phase-1 data schemas (`@bookmark-digest/schemas`, `packages/schemas/src/index.ts`): `sourceSchema`, `digestSchema`, `sourceStatus`, `digestGoalSchema`, `digestStatus`
- DynamoDB infrastructure: `SourcesTable` (PK: `contentHash`, GSI for URL-indexing with DynamoDB Stream) and `DigestsTable` (PK: `id`, GSI for source-hash + goal dedup) via CDK stack `BookmarkDigest` (`apps/infra/lib/bookmark-digest-stack.ts`)
- Lambda functions: `ingest-url` (URL ingestion via Firecrawl), `embed-source` (Bedrock embedding via DynamoDB Stream trigger), `generate-digest` (request validation + async dispatch), `generate-digest-worker` (Gemini/Bedrock call + zod validation), `fetch-source`, `fetch-digest`, `list-sources`, `related-sources` (brute-force cosine similarity), `digest-goals` (config endpoint), `check-embed-failures` (EventBridge daily cron)
- Web SPA: `react-router-dom` routes (`/`, `/browse`, `/sources/:contentHash`, `/digests`, `/digests/:digestId`), `router.tsx`, `App.tsx`, `styles.css` with 40+ CSS variables for dark theme
- Browse page (`/browse`) with Sources/Digests toggle, structural filters, substring search, and semantic search (`GET /sources/search`)
- Source detail page (`/sources/:contentHash`) with metadata, extracted content, generated digests list, and "Related from your bookmarks" panel
- Android share target: `IngestWorker` (WorkManager background processing), `IngestNotifications` (notification-based feedback), `ShareActivity` (theme-less, instant-finish), `LoginActivity` (Amplify Android Cognito SRP flow), `AndroidManifest.xml`
- push-source CLI (`apps/infra/scripts/push-source.ts`): `extract`, `create`, `login`, `logout` subcommands with Cognito token caching at `~/.config/bookmark-digest/cognito-token.json`
- `detectThinFetch()` in `apps/infra/lib/thin-fetch.ts`: detects page chrome vs. content in first ~1,000 characters
- `resolveUrl()` in `apps/infra/lib/resolve-url.ts`: unwraps google.com URL shortener params and follows HTTP redirect chains
- `DigestMeta` generation: subject (curated enum), tags (1-6 strings), synopsis
- Two independent generation axes: `digestGoal` (tl_dr/summary/understand) × `sourceMode` (synthesize/compare/evolution) composed into system prompt
- Cognito User Pool with public mobile client config (`generateSecret: false`, `authFlows: { userSrp: true }`)
- SNS embed failure alerts (optional email subscription)
- EventBridge daily 06:00 UTC cron for `check-embed-failures`

### Changed

- Pivoted to two-fork architecture (Fork A "Sediment" primary, Fork B "rendered digests" secondary, kept) — `docs/two-fork-architecture.md`, `plans/ROADMAP.md` (restructured 2026-09-03)
- Switched from Vercel AI SDK (`@ai-sdk/google`, `@ai-sdk/amazon-bedrock`) to direct provider calls: `callGemini()` (JSON POST to `generativelanguage.googleapis.com`) and `callBedrockClaude()` (`InvokeModelCommand` with Anthropic Messages body) — per `wiki/decisions.md` "The Vercel AI SDK was dropped"
- Content model changed from flat `DigestBlock[]` to nested json-render `Spec` tree (`root` + `elements`) — resolved schema-minimum output bug — per `wiki/decisions.md` "Content model: json-render's native Spec tree, not a flat block array"
- Moved from hardcoded hex colors to CSS variables in `apps/web/src/app/styles.css` — 40+ new variables for code blocks, charts, callout variants, utility borders, semantic accents

### Fixed

- Registry guard: `apps/web/src/lib/registry.tsx` throws at module load on missing catalog block renderer (prevented `ComparisonTable`/`AuthorCard`/`TimelineEvent` from shipping unrendered) — per `wiki/decisions.md` "Registry throws on a missing renderer"
- `ingest-url` URL resolution: added `apps/infra/lib/resolve-url.ts` to unwrap `google.com/url?q=...` wrappers and follow HTTP 3xx redirect chains — previously shortener URLs were passed directly to Firecrawl, causing fetch failures
- Share-result feedback: replaced `Toast` with `IngestNotifications` notification (`IngestNotifications.kt`) — Android 10+ silently swallows background toasts posted after `ShareActivity.finish()` — per `wiki/gotchas.md` "Background toasts are silently swallowed on Android 10+"
- `GET /digests` route: folded list-all-with-filters into `fetch-digest` handler instead of creating a second Lambda — per `wiki/gotchas.md` "A single API Gateway resource+method can only route to one Lambda"
- `newSearch` DynamoDB update expression: added missing `#name` entry (not just `:value`) in placeholder object to fix ValidationException — per `wiki/gotchas.md` "`digestsUpdate`/`sourcesUpdate`'s placeholder object needs BOTH the `#name` and `:value` entries"
- `getSourceContent()` scan projection: always passes `projectionExpression` to avoid returning only a handful of rows per page due to inline `content` + multi-hundred-float `embedding` — per `wiki/gotchas.md` "An unprojected `Sources` scan returns a handful of rows per page"

### Removed

- `matchTag` unused import and zero-width-space artifact in `generate-digest` console.warn (P1 audit fix, `wiki/current-work.md`)
- Reverted DynamoDB native `SearchVectors` vector index — brute-force cosine similarity scan retained instead (per `wiki/decisions.md` "Semantic search: brute-force cosine, not a vector index")
- `DecisionItem` catalog block — cut before implementation, referenced in `plans/archive/phase-2-scope.md`
