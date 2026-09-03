# bookmark-digest — current state (standalone summary)

> **Written 2026-09-03. Historical input — kept, not maintained.**
>
> This is the ground-truth summary that `raw/HANDOFF.md` (also 2026-09-03) was
> generated from. Both are kept as the provenance trail for the two-fork
> pivot; neither is updated going forward.
>
> **For current state, read instead:** `docs/two-fork-architecture.md`,
> `plans/ROADMAP.md`, `wiki/current-work.md`, `wiki/decisions.md`.
>
> **Known inaccuracy in this file:** it describes `apps/web` as a Next.js
> frontend. It is not — `apps/web` was already a Vite SPA on this date
> (`"dev": "vite"`, `react-router-dom`, `src/main.tsx`, no `next` dependency
> in any `package.json`). That claim propagated into the handoff as a
> "decided and pending" Next.js → Vite migration that never existed. Likely
> cause: `src/app/` uses Next-style `page.tsx` folder-per-route naming, which
> is a cosmetic convention. See `wiki/decisions.md`.

A personal bookmark tool. Save a URL (or paste/upload content directly) and it
generates an AI-written, visually rich digest rendered as a nested content tree
rather than plain markdown. This document is self-contained — it does not point
at any other file in the repo. Read the whole thing to understand where the
project is and what the non-obvious constraints are before working on it.

---

## What the product is

- **Core loop:** save a source (URL or pasted/uploaded content) → a background
  pipeline fetches the page, embeds it, and calls an LLM to generate a digest →
  the digest renders as a structured, multi-component layout on a web page →
  digests are searchable by text and by semantic similarity.
- **Inputs:** a single URL, or the raw content of a page, PDF, or HTML pasted or
  uploaded by hand (used when remote fetch returns page chrome instead of the
  real article).
- **Output:** a digest built from a catalog of ~25 content blocks (prose,
  grid, cards, stat cards, charts, timelines, comparison tables, pull quotes,
  author profiles, etc.) composed into a nested spec tree.

---

## Repo layout

- **Monorepo, pnpm workspace.**
- `apps/infra` — AWS CDK/TypeScript: all infrastructure and Lambda handlers, plus
  CLI/one-off scripts. This is where ingestion, generation, embedding, and
  search backends live.
- `apps/web` — the Next.js frontend: `/browse` (Sources and Digests tabs),
  source detail pages, and the digest renderer.
- `apps/mobile/android` — an Android share target app that saves links from the
  phone's share sheet into the backend.
- `packages/catalog` — the framework-agnostic digest catalog: the block
  definitions, their props schemas, and the non-React renderers.
- Authentication is Cognito (User Pool). The web app and the Android app both
  sign in with it; the CLI and the Android share POST reuse the same token.

---

## Architecture (how it's actually built)

### Storage — DynamoDB, not a database-with-vectors
- Two on-demand tables: **Sources** and **Digests**. No VPC, no connection
  pooling, no cold-start warmup.
- Reason: the target AWS account is on the Free Plan, which cannot provision
  Aurora/RDS via CDK. DynamoDB Streams are used to trigger embedding instead of
  directly invoking a Lambda on write.
- Embeddings are stored alongside sources and ranked by brute-force cosine
  similarity over a paginated `Sources` scan.

### Semantic search — brute-force cosine, deliberate
- A native DynamoDB vector index (`SearchVectors`) was tried, found broken in
  six concrete ways, and reverted. The six failure modes:
  1. No `<` / `>` operator — can't express "better than threshold."
  2. Inverted score semantics — higher score means *less* similar, not more.
  3. No way to wait for a backfill to finish before querying.
  4. Fixed vector dimensions — can't accept whatever size the embedding model
     emits.
  5. Silently-swallowed fallback — queries either fail loudly or return junk.
  6. (Combined with the above) no reliable way to bound the scan by score.
- Decision: keep brute-force cosine at personal-markers scale (thousands of
  rows is a cheap scan). Revisit only if a scan measurably hurts, and start from
  those six failure points rather than from scratch.

### Content model — nested spec tree, not a flat block array
- Digests are json-render's native `Spec` tree (`{root, elements}`), compiled
  with RFC-6902 patches. This matches how the catalog's prompt describes output.
- A prior flat `DigestBlock[]` model silently produced schema-minimum output
  (empty props) because the catalog's own schema falls back to `z.record(unknown)`
  once a catalog has more than one component. Per-type prop validation is layered
  on top via `validateDigestSpec`; it is not free once you adopt the tree model.

### Two independent generation axes
- **`digestGoal`** (depth/voice): `tl_dr` / `summary` / `understand`.
- **`sourceMode`** (multi-source shape): default `synthesize` / `compare` /
  `evolution`.
- These are composed independently in the *system* prompt: goal-template →
  mode-template → `GROUNDING_RULES` → catalog prompt. The user turn carries only
  source material, never assertions about what to do.
- `sourceMode` is **deliberately not inferred** from source count or content —
  that inference is the same judgment call that produced wrong shapes
  originally (e.g. asserting "compare" for two complementary articles by one
  author).
- `digestGoal` (what the digest should do) and `digestType` (the source
  classification `article` / `video` / `podcast` / …) are intentionally separate
  concepts with separate owners. They were deliberately not merged.

### Ingestion escape hatches
Remote fetch (default: Firecrawl) sometimes loses fidelity — returns page chrome
(A YouTube watch page: nav, sign-in, view counts, no transcript) or silently
drops link targets (a citation list rendered as plain text). Two hatches exist
for the same underlying problem, "the source is fine, the fetch isn't":
- **Manual paste** (shipped): `POST /sources` accepts `content` directly,
  tagged `fetchedBy: "manual"`.
- **File upload** (planned): same idea, HTML/PDF instead of pasted text, so real
  link targets survive.
- YouTube transcript fetching (InnerTube caption endpoint) was tried inside the
  Lambda and reverted — it works from a residential IP but silently returns no
  captions from Lambda's shared IP ranges. It survives only as a local CLI
  script feeding the manual-paste path.

### Model calls — direct, two providers, two functions
- The Vercel AI SDK was dropped. It used `ai` + `@ai-sdk/google` +
  `@ai-sdk/amazon-bedrock` for two providers and exactly one call shape, but its
  retry logic fought the quota fallback: it retried transient failures itself,
  wrapped the cause in a `RetryError` whose message hid the 429, and those silent
  retries burned free-tier Gemini quota that the Bedrock fallback exists to
  conserve.
- Both providers are now one hand-written function each — `callGemini()` (a single
  JSON POST to `generativelanguage.googleapis.com`) and
  `callBedrockClaude()` (`InvokeModelCommand` with the Anthropic Messages body),
  normalizing to a shared `LlmResult`.
- Quota exhaustion is a real `GeminiQuotaError` thrown on HTTP 429 /
  `RESOURCE_EXHAUSTED`, not a regex guess. `withOneRetry` retries 5xx only, never
  429.
- The accepted tradeoff: response parsing is now ours to maintain (Gemini's
  `candidates[0].content.parts`, Bedrock's `stop_reason` naming), and adding a
  third provider would mean a third hand-written adapter. Two providers × one call
  shape is below the threshold where a provider abstraction pays for itself.

### Metadata — deliberately 2 calls, not 1 or 3
- Spec generation and `generateMeta()` (subject/tags/synopsis/etc.) are separate
  model calls. Merging them couples failure modes and competes for
  context/attention on the harder task. An agentic tool-calling loop for the whole
  pipeline was rejected — the repair logic (spec repair, null-stripping,
  dangling-ref pruning) is exactly the kind of thing that should stay
  deterministic code, and there's no real branching to justify the indirection.

### Mobile auth — Cognito, not an API key
- `POST /sources` is behind the Cognito User Pool authorizer like every other
  route except `/digest-goals`.
- The tempting shortcut for the phone app — `apiKeyRequired` + a usage plan with a
  static `x-api-key` — was rejected: an API key baked into an APK is trivially
  extractable (`unzip` + `strings` on `BuildConfig`), it isn't scoped to a user,
  and rotating it means shipping a new build.
- Instead the Android app depends on Amplify Android and has a one-time
  email/password login. It works without any stack change because the user-pool
  client is shaped for a public mobile client (`generateSecret: false`,
  `authFlows: { userSrp: true }`). Amplify does the SRP handshake, caches tokens in
  EncryptedSharedPreferences, and refreshes them.

---

## The two milestones

### Milestone 1 — HISTORY (shipped)
- **Two-axis catalog:** `source-variant` (written/temporal) × `digest-block` (25
  content blocks, all registered, all rendered). The React-free catalog is in
  `packages/catalog`; renderers live in `apps/web`.
- **Registry exhaustiveness guard:** `registry.tsx` throws at module load if any
  catalog block type has no registered component. This exists because three blocks
  (`ComparisonTable` / `AuthorCard` / `TimelineEvent`) shipped registered-but-
  unrendered for three commits before anyone noticed. The guard must stay, and any
  future multi-catalog refactor must read from the single flat `digestBlockProps`
  map it walks.
- **Single-source generation:** `tl_dr` / `summary` / `understand` goals.
- **Multi-source generation:** `sourceHashes[]` in, one digest out, deduped and
  order-normalized. `ComparisonTable`, `AuthorCard`, `TimelineEvent`, and
  `ComparisonNarrative` cover the comparison/evolution/entity-profile shapes.
- **Visual blocks:** `Chart` (bar/sparkline), `PullQuote`, on top of the original
  19 (`Grid`, `Card`, `StatCard`, etc.).
- **Related-bookmarks retrieval:** brute-force cosine similarity over a paginated
  `Sources` scan.
- **Embedding failure handling:** status transitions to `failed` with a stored
  reason, retry-with-backoff for throttling, a dead-letter queue, stale-status
  guards.
- **Browse + search:** `/browse` (Sources/Digests toggle, structural filters for
  content type / status / date / digestGoal, substring search), semantic search
  (embed the query, rank by cosine), `title` capture on ingest, and `DigestMeta`
  generation (subject/tags/`digestType`/tone/…) for single-source digests.

### Milestone 2 — TODO (queue in order)
1. ✅ **Digest metadata completeness** — closes the biggest Milestone-1 gap:
   `DigestMeta` previously only existed for single-source digests. Plan covered
   multi-source `DigestMeta` with subject/tags/synopsis. Steps 1–4 done.
2. ✅ **Suggested bundles** — a shared `inferSourceMode` heuristic, related-sources
   fetch, and a "Generate digest from related sources" button on both the Source
   and Digest detail pages. Unblocked since Milestone 1.
3. 🟡 **Source quality + file upload** — merges two plans: *detect* that a fetch
   got chrome instead of content, and *recover* by letting the user hand over the
   page directly.
   - **Part A (shipped):** `detectThinFetch()` in `apps/infra/lib/thin-fetch.ts`
     inspects the first ~1,000 chars (after normalizing curly apostrophes to
     ASCII): `That's an error` alone, or 2+ of `Skip navigation` / `Show
     transcript` / `Sign in`, marks that source `status: "thin"` so the ingest
     dedup treats it as re-fetchable, and the digest fails with a specific,
     user-facing error naming the source (not the generic "Internal error during
     generation"). Wired into `runGeneration` after the missing-length check and
     **before** `status: "generating"` — the last point before quota is spent.
     `thin` was added to the `sourceStatus` schema enum, the Browse source filter,
     and badge colors. Embed-source skips non-`embedding` stream events, so the
     chrome is never re-embedded. Covered by a vitest suite.
   - **Part B (not built):** a statistical signal-density threshold. Stays gated
     on ~50 sources / ~10 known-bad before it's worth fitting.
   - **File upload (not built):** same idea as manual paste but for HTML/PDF so
     real link targets survive.
4. ✅ **Source detail page** — `/sources/:contentHash` in-app view (frontend-only,
   no CDK/IAM changes): metadata, extracted content, "Open original ↗", list of
   generated digests, and a "Related from your bookmarks" panel fetched via
   `GET /sources/{sourceHash}/related` — not the dead `DigestPage` placeholder
   (which was never wired to real data).
5. ⬜ **Explore-agent** — "Explore this": given a topic/query instead of a URL, an
   agent plans → searches the web for sources → fetches them → hands off to the
   existing multi-source generation path. Milestone 2's capstone; deliberately
   last and the least specified. The shape of "search the web for sources" isn't
   decided and shouldn't be until the rest of the queue has shipped and been
   dogfooded.

### Deferred and parked
- **Deferred with a trigger (not built):** per-goal/mode `allowedBlockTypes`
  block allowlist, or multiple `defineCatalog()` calls, to disambiguate blocks
  (`Chart` vs `StatCard`/`ComparisonTable`, `PullQuote` vs `QuoteBlock`, etc.) via
  prompt-text guidance only today. It was designed twice and deliberately not built
  both times — building it before real misuse is observed would be speculative
  infrastructure. Re-read and reassess only if the model actually reaches for the
  wrong block in practice.
- **Parked (real but not worth a queue slot):** progressive digest streaming (needs
  an infra shape change — Function URL or WebSocket — not justified until
  generation latency is measured as a problem), S3 Glacier lifecycle policies for
  raw source content (no current cost pressure), image/OCR ingestion (a fourth
  ingestion path with its own design questions, noted but not scoped).

---

## Active work: push-source CLI

A CLI to push sources without the web app: `apps/infra/scripts/push-source.ts`
(`npm run push-source`), four subcommands. **In progress, partially uncommitted.**

- `extract <url> [--out <file>]` — fetches a YouTube transcript into a `.md`
  (default: a timestamped file in the cwd; the absolute path is printed to
  stdout).
- `create <file> --url <url> [--content-type <type>]` — POSTs the file's contents
  to `POST /sources`; prints the `{ sourceHash, status }` response.
- `login` — forces a fresh Cognito login.
- `logout` — clears the cached token.

Design notes worth knowing:
- The YouTube logic was pulled out of the old standalone script into
  `lib/youtube.ts` — an `any`-free, nested-guarded `isInnerTubePlayer` narrows the
  untrusted InnerTube JSON — so `extract` and the script share one code path.
- **Auth** lives in `lib/cognito-auth.ts` using a dedicated CLI Cognito client
  (`bookmark-digest-stack.ts` `CliClient`, `password: true`, `CfnOutput`
  `CliUserPoolClientId`): email/password login, token cached at
  `~/.config/bookmark-digest/cognito-token.json` (mode `0600`, written after a
  `mkdir -p`), refreshed silently via the refresh token, only re-prompting for the
  password. `create` sends the **bare** idToken in `Authorization` (no `Bearer `
  prefix) plus `{ url, content, contentType }`.
- `main()` wraps the dispatch in try/catch and `await`s the async handlers so a
  missing field prints a one-line error rather than a Node stack trace.
- The API base URL and CLI client id come from `apps/infra/outputs.json` via a
  `stack-outputs.ts` helper (`pnpm outputs` regenerates it after each deploy);
  `BKDG_CLIENT_ID` / `BKDG_REGION` env vars are optional overrides, so nothing is
  injected by hand.
- `pnpm typecheck` is clean and config-resolves-from-outputs.json was
  smoke-tested.

**Remaining:** full end-to-end `login → extract → create → POST /sources`.

---

## Non-obvious constraints (check these before touching adjacent code)

1. **API Gateway routes to exactly one Lambda per resource+method.**
   `GET /digests` was already load-bearing before Phase 3; a first pass tried to
   add a "list all digests with filters" mode by creating a *second* Lambda and
   repointing `GET /digests`, which silently orphaned the existing
   `?sourceHash=` branch (the old Lambda stopped receiving root-level requests)
   and broke per-source digest lookup. Fixed by folding the new mode into the same
   Lambda as a third branch. Before repointing any existing resource+method, grep
   the frontend for every call to that exact path and check who the current Lambda
   already handles — don't trust a plan doc's claim about route ownership.
2. **New API Gateway resources need an explicit route.** Creating a `NodejsFunction`
   and granting it permissions does nothing on its own — you must also call
   `.addResource().addMethod()`. A first pass built and wired IAM for a search
   function but never added the route, so the request matched the sibling
   `/sources/{sourceHash}` resource (`sourceHash="search"`) and 404'd. `cdk diff`
   would show it — so diff the API surface, not just the Lambda/IAM diff.
3. **`Authorization` takes a bare idToken, no `Bearer ` prefix.** Adding the
   conventional prefix gets a bare 401 with no CloudWatch log line, because the
   authorizer rejects the request before the Lambda runs. It must be the **ID**
   token, not the access token.
4. **A DynamoDB update's `#name` placeholder needs both `#name` and `:value`.**
   The update helpers split one placeholders object by whether each key starts with
   `#`. If an `UpdateExpression` references `#foo` but the caller only added `:foo`,
   DynamoDB throws a `ValidationException` at call time — not a type error, caught
   only when the Lambda actually runs. When adding a conditional field, add the
   name/value pair together in the same `if` block.
5. **New clients posting to `/sources` must run the URL through `Ingest.extractUrl()`.**
   Share text is usually not a bare URL — YouTube shares `"Video title\nhttps://...`
   and many apps append a promo line or leave it in the subject. `extractUrl()`
   regexes out the first `https?://\S+` and strips trailing punctuation. Without it,
   a title-prefixed string sails past validation and comes back 422 "Failed to
   fetch content", which reads like a fetch failure rather than a client bug.
6. **Background toasts are silently swallowed on Android 10+.** Any background work
   in the mobile app that needs to tell the user something must use a notification,
   not a toast, the moment it can outlive the foreground activity. Terminal share
   state (Saved / Already saved / Couldn't fetch / Failed to save / Sign in) is a
   notification; the Unauthorized one carries a `PendingIntent` that opens the login
   activity (a notification can launch an activity from the background; a worker
   cannot). The share POST runs in WorkManager (not a coroutine in the activity)
   because a Firecrawl scrape takes 10–30s and a plain coroutine would race process
   death.
7. **`registry.tsx` must keep walking the single flat `digestBlockProps` map.**
   Don't remove the missing-renderer guard, and don't let a future multi-catalog
   refactor read from anything else.

---

## Running it on a budget (model assignment)

- **Local model (Qwen3.6-35B via oMLX) for:** pure-function / local-file work that
  doesn't need live AWS state or cross-file architectural judgment — tag
  normalization/edit-distance functions, fetch-failure marker substring matchers,
  HTML/PDF extraction adapters, writing renderer components + CSS for new blocks.
- **Claude/Pi for:** CDK diffs, IAM grants, route wiring, deployment verification,
  and anything touching the two-axis system's invariants (registry exhaustiveness,
  GSI-key normalization, prompt-axis composition order). Those are exactly where
  silent failures have slipped through before.

---

## Where things live
- Lambda handlers, CDK, scripts, libs: `apps/infra/`.
- Web frontend + renderers: `apps/web/`.
- Catalog definitions + non-React renderers: `packages/catalog/`.
- Android share target: `apps/mobile/android/`.

---

*Last verified: 2026-09-03. The push-source CLI has uncommitted edits.*
