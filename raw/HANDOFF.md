# Sediment (née bookmark-digest) — Full Handoff: Phase 2/3

**Status:** v3 — restructured around the two-fork architecture decided in
this handoff conversation. This supersedes v1 (which assumed the rendered
digest pipeline would be retired) and v2 (which corrected v1 against the
full STATUS.md but kept the retirement framing). Written for Claude Code
handoff: context and decisions, not code. Produce an implementation plan
from this; don't start writing code off this doc alone.

**Companion docs (repo):** `AGENTS.md`, `wiki/current-work.md`,
`wiki/decisions.md`, `wiki/gotchas.md`, `plans/ROADMAP.md`, `CLAUDE.md`,
`PARKED.md`, `bookmarkdigest-rules-to-code-by.md`.

---

## 0. What changed in v3 — read this first

Earlier versions of this doc assumed Sediment meant **replacing** the
rendered-digest product with a plain-markdown, emergence/recall-first
one — i.e., retire `packages/catalog`, `registry.tsx`, the json-render
Spec tree, RFC-6902 patches.

**That's wrong. The actual decision is a two-fork architecture:**

- **Fork A (primary, gets engineering priority going forward):** the
  Sediment substrate — Source ingestion, extraction, SourceHealth,
  tagging, embeddings, TL;DR-at-ingestion, emergence, recall. This is
  where new work defaults to.
- **Fork B (secondary, kept alive deliberately, not retired):** the
  existing rendered-digest pipeline — two-axis block catalog,
  `registry.tsx`, json-render Spec tree, RFC-6902 patches, Explore-agent.
  Stays as a real product, gets whatever maintenance it genuinely needs,
  but doesn't get engineering priority when the two forks compete for
  time. Explicitly framed as "a good proto and proof-of-concept," worth
  preserving rather than deleting.
- **The bridge, which is what makes this workable rather than just
  "run two products":** the deterministic extraction structure
  (KeyPoints, Statistics, QuoteBlocks, Themes) and TL;DR live **once, on
  the Source**, not re-derived per Digest. Fork B's generation should
  consume that shared structure — and, if Fork A's focus pulls
  engineering time away from Fork B for a while, Fork B can build its
  rendered digests **from already-made TL;DR/summary segments** rather
  than needing independent raw-content access. Fork B degrades
  gracefully instead of rotting.

Two confirmed field-level decisions that follow from this:

- **TL;DR (Source-level) and `DigestMeta` (Digest-level: type/tone/length/
  date per generation) stay separate fields** — not merged, as v2 had
  speculated they might be.
- The extraction structure is a **Source-level artifact**, read by both
  forks, computed once.

And the data-model question (single-table vs. two-table, open since v1)
is now settled by a third input — **S3 as source of truth**:

- **S3** holds canonical raw + extracted content per Source, keyed by
  `contentHash`. Permanent archive — survives even if the origin URL dies.
- **Sources table** (DynamoDB) = Fork A's index: metadata, SourceHealth,
  tags, embeddings, TL;DR, pointer into S3.
- **Digests table** (DynamoDB) = Fork B's output store, unchanged,
  referencing `sourceHash` as it does today.
- **Future Papers table** (Track 3, still parked) follows the same
  pattern — its own table, join items pointing back to Source.
- **This means: three fork-scoped tables, not a single-table migration.**
  Simpler than either of the two options this doc previously debated.

The frontend-framework resolution from the prior turn (Next.js → Vite,
folded into Fork-A-adjacent work) stands unchanged — see §5.1.

---

## 1. Current Architecture — As Built (Fork B today, pre-any-change)

Everything in this section describes what's **already shipped** and
constitutes Fork B. None of it needs to change architecturally under the
two-fork decision — it just stops being "the whole product."

### 1.1 What the product actually does

Save a source (URL, or paste/upload raw content) → background pipeline
fetches, embeds, and calls an LLM to generate a digest → digest renders as
a structured multi-component layout → digests are searchable by text and
semantic similarity.

### 1.2 Repo layout

- Monorepo, pnpm workspace.
- `apps/infra` — AWS CDK/TypeScript: all infra, Lambda handlers, and
  CLI/one-off scripts. Ingestion, generation, embedding, and search
  backends all live here.
- `apps/web` — **currently Next.js**; migration to Vite SPA is decided
  and pending (§5.1). Houses `/browse` (Sources/Digests tabs), source
  detail pages, and the digest renderer (Fork B's UI).
- `apps/mobile/android` — Android share-target app; saves links from the
  phone's share sheet into the backend. A Fork-A-relevant ingestion
  client (it feeds Sources), independent of which fork consumes the
  result.
- `packages/catalog` — Fork B's framework-agnostic digest catalog: block
  definitions, prop schemas, non-React renderers. **Stays.**
- Auth: Cognito User Pool. Web app, Android app, and CLI all sign in with
  it and reuse the same token shape (bare ID token, see §3).

### 1.3 Storage — DynamoDB, not a database-with-vectors

- Two on-demand tables today: **Sources** and **Digests** — soon three,
  once S3 is introduced as the content source of truth (§0, §5.1) and
  Papers eventually joins as a third table. No VPC, no connection
  pooling, no cold-start warmup.
- Reason for DynamoDB over Postgres/Aurora: target AWS account is on the
  Free Plan, which can't provision Aurora/RDS via CDK. DynamoDB Streams
  trigger embedding on write, rather than a direct Lambda invoke.
- Embeddings stored alongside sources, ranked by brute-force cosine
  similarity over a paginated `Sources` scan.

### 1.4 Semantic search — brute-force cosine, deliberate, with receipts

A native DynamoDB vector index (`SearchVectors`) was tried and reverted.
Six concrete, documented failure modes:

1. No `<`/`>` operator — can't express "better than threshold."
2. Inverted score semantics — higher score means _less_ similar.
3. No way to wait for backfill to finish before querying.
4. Fixed vector dimensions — can't accept whatever size the embedding
   model emits.
5. Silently-swallowed fallback — queries fail loudly or return junk, no
   middle ground.
6. Combined with the above: no reliable way to bound the scan by score.

Decision: keep brute-force cosine at personal-markers scale (thousands of
rows is a cheap scan). Revisit only if a scan measurably hurts — and if
so, start from these six failure points, not from scratch. **This
substrate is shared by both forks** (related-bookmarks in Fork B today,
emergence/recall retrieval in Fork A going forward) — don't relitigate it
for either.

### 1.5 Content model (Fork B) — nested spec tree, not a flat block array

- Digests are json-render's native `Spec` tree (`{root, elements}`),
  compiled with RFC-6902 patches.
- **Why not a flat `DigestBlock[]`:** tried first, silently produced
  schema-minimum output (empty props), because the catalog's own schema
  falls back to `z.record(unknown)` once a catalog has more than one
  component type. The tree model fixes this but imposes cost: per-type
  prop validation is layered on top via `validateDigestSpec` — not free.
- Output: a catalog of ~25 content blocks (prose, grid, cards, stat
  cards, charts, timelines, comparison tables, pull quotes, author
  profiles, etc.) composed into the nested tree.
- **Under the two-fork model:** this generation step is the one that
  should eventually read from the shared extraction structure (§0) rather
  than raw source content — see §4.3 for the concrete plan.

### 1.6 Two independent generation axes (Fork B)

- **`digestGoal`** (depth/voice): `tl_dr` / `summary` / `understand`.
- **`sourceMode`** (multi-source shape): default `synthesize` / `compare`
  / `evolution`.
- Composed independently in the **system** prompt, in a fixed order:
  goal-template → mode-template → `GROUNDING_RULES` → catalog prompt. The
  user turn carries only source material, never assertions about what to
  do.
- `sourceMode` is **deliberately not inferred** from source count or
  content — that inference is exactly the judgment call that produced
  wrong shapes before (e.g., asserting "compare" for two complementary
  articles by the same author, when synthesis was correct).
- `digestGoal` (what the digest should _do_) and `digestType` (the source
  classification: `article`/`video`/`podcast`/…) are intentionally
  separate concepts with separate owners — deliberately not merged.
- Note: `digestGoal: tl_dr` predates and is distinct from the new
  Fork-A TL;DR field (§4.1) — same word, different artifact, different
  owner. Don't conflate them when naming things going forward.

### 1.7 Ingestion escape hatches (shared substrate, Fork-A-relevant)

Firecrawl (default remote fetch) sometimes loses fidelity — returns page
chrome (a YouTube watch page: nav, sign-in, view count, no transcript) or
silently drops link targets. Two hatches address "the source is fine, the
fetch isn't":

- **Manual paste (shipped):** `POST /sources` accepts `content` directly,
  tagged `fetchedBy: "manual"`.
- **File upload (planned, not built):** same idea for HTML/PDF, so real
  link targets survive.
- **YouTube InnerTube caption endpoint:** tried inside the Lambda,
  reverted — works from a residential IP but silently returns no captions
  from Lambda's shared IP ranges. Survives as a local CLI script feeding
  the manual-paste path (`push-source extract`, §1.11).

### 1.8 Model calls — direct, two providers, two hand-written functions

- **Vercel AI SDK was dropped for a specific reason:** its retry logic
  fought the quota fallback — it retried transient failures itself,
  wrapped the cause in a `RetryError` whose message hid the underlying
  429, and those silent retries burned free-tier Gemini quota that the
  Bedrock fallback exists specifically to conserve.
- Replacement: one hand-written function per provider — `callGemini()`
  (single JSON POST to `generativelanguage.googleapis.com`) and
  `callBedrockClaude()` (`InvokeModelCommand`, Anthropic Messages body) —
  normalized to a shared `LlmResult`.
- Quota exhaustion is a real, typed `GeminiQuotaError` on HTTP 429 /
  `RESOURCE_EXHAUSTED` — not a regex guess. `withOneRetry` retries 5xx
  only, **never** 429.
- Accepted tradeoff: response parsing is ours to maintain; a third
  provider means a third hand-written adapter. Two providers × one call
  shape is judged below the threshold where an abstraction library pays
  for itself. **This stack is shared by both forks** — Fork A's TL;DR
  generation and extraction calls should use the same `callGemini`/
  `callBedrockClaude` functions, not a parallel LLM-calling path.

### 1.9 Metadata — deliberately 2 model calls, not 1 or 3 (Fork B)

- Spec generation and `generateMeta()` (subject/tags/synopsis/etc.) are
  **separate** model calls — merging them would couple failure modes and
  make the two tasks compete for context on the harder one.
- An agentic tool-calling loop for the whole pipeline was considered and
  rejected: the repair logic (spec repair, null-stripping, dangling-ref
  pruning) should stay deterministic code; no real branching justifies an
  agent loop.
- This same instinct (keep generation tasks separated, not merged) is
  worth carrying into Fork A's design: TL;DR generation, tag generation,
  and structured extraction are plausibly three separate calls too,
  rather than one call doing all three.

### 1.10 Mobile auth — Cognito via Amplify, not an API key

- `POST /sources` sits behind the same Cognito User Pool authorizer as
  every other route except `/digest-goals`.
- API-key shortcut rejected: trivially extractable from an APK
  (`unzip`+`strings` on `BuildConfig`), not user-scoped, rotation needs a
  new build.
- Instead: Android depends on Amplify Android, one-time email/password
  login, no stack change needed (user-pool client already shaped for a
  public mobile client: `generateSecret: false`,
  `authFlows: { userSrp: true }`). Amplify does SRP, caches tokens in
  `EncryptedSharedPreferences`, refreshes them.
- Android constraint: **background toasts are silently swallowed on
  Android 10+.** Terminal share states use notifications, not toasts; the
  Unauthorized one carries a `PendingIntent` to the login activity. Share
  POST runs in **WorkManager**, not a coroutine, since a Firecrawl scrape
  takes 10–30s and a coroutine would race process death.

### 1.11 Active, uncommitted work: push-source CLI

`apps/infra/scripts/push-source.ts` (`npm run push-source`), four
subcommands:

- `extract <url> [--out <file>]` — YouTube transcript → `.md`.
- `create <file> --url <url> [--content-type <type>]` — POSTs to
  `POST /sources`; prints `{ sourceHash, status }`.
- `login` / `logout` — Cognito.

Design notes:

- YouTube logic in `lib/youtube.ts` — `any`-free, nested-guarded
  `isInnerTubePlayer` narrows untrusted InnerTube JSON.
- Auth in `lib/cognito-auth.ts` via dedicated CLI Cognito client
  (`CliClient`, `password: true`); token cached at
  `~/.config/bookmark-digest/cognito-token.json` (mode `0600`); bare
  idToken sent, no `Bearer ` prefix.
- API base URL / CLI client ID from `apps/infra/outputs.json` via
  `stack-outputs.ts` (`pnpm outputs` after each deploy).
- `pnpm typecheck` clean; config-resolves-from-outputs.json smoke-tested.
- **Remaining:** full end-to-end `login → extract → create → POST
/sources`. This is a Fork-A-relevant ingestion client (an alternate way
  to populate Sources), independent of the fork debate.

---

## 2. Milestone Status (as of 2026-09-03, Fork B's history)

### Milestone 1 — shipped

- Two-axis catalog: `source-variant` × `digest-block` (25 blocks, all
  registered, all rendered).
- **Registry exhaustiveness guard:** `registry.tsx` throws at module load
  if any catalog block type has no registered component (exists because
  three blocks shipped registered-but-unrendered for three commits before
  anyone noticed). **Stays — this guard has permanent value under the
  two-fork model, not just until a retirement that isn't happening.**
- Single-source generation (`tl_dr`/`summary`/`understand`); multi-source
  generation. Related-bookmarks (brute-force cosine, §1.4). Embedding
  failure handling (dead-letter queue, retry-backoff, stale-status
  guards). Browse + search.

### Milestone 2 — queue in order

1. ✅ Digest metadata completeness — multi-source `DigestMeta`.
2. ✅ Suggested bundles — `inferSourceMode` heuristic + related-sources
   button.
3. 🟡 Source quality + file upload:
   - Part A ✅ `detectThinFetch()` (`apps/infra/lib/thin-fetch.ts`) —
     detects chrome-not-content, marks `status: "thin"`, fails generation
     with a specific error before quota is spent. **This is Fork-A-shaped
     work already — see §4.2, it's the seed of SourceHealth.**
   - Part B not built (gated on ~50 sources / ~10 known-bad).
   - File upload not built.
4. ✅ Source detail page — `/sources/:contentHash`, includes "Related from
   your bookmarks" panel.
5. ⬜ **Explore-agent** — topic/query → agent plans → searches web →
   fetches sources → hands off to multi-source generation. Milestone 2's
   capstone, deliberately last/least-specified. **Stays as a Fork B
   feature** — it's real, useful, and under the two-fork model there's no
   pressure to retarget its output format; it can keep producing rendered
   digests indefinitely, or later read from the shared extraction
   structure (§4.3) same as any other Fork B generation path.

### Deferred and parked (Fork B)

- **Deferred, with a trigger condition:** `allowedBlockTypes` allowlist,
  to disambiguate visually-similar blocks. Designed twice, deliberately
  not built either time. **Un-cancelled under the two-fork model** — this
  doc previously (v2) called it "moot once rendering is retired"; since
  rendering isn't being retired, it's legitimately still just deferred,
  re-read only if the model actually reaches for the wrong block.
- **Parked:** progressive digest streaming, S3 Glacier lifecycle for raw
  content (note: distinct from the new S3-as-source-of-truth use in Fork
  A, §5.1 — that's storage architecture, this is a cost-optimization
  policy on top of it, still not urgent), image/OCR ingestion.

---

## 3. Non-obvious constraints (shared substrate — read before touching adjacent code)

1. **API Gateway routes to exactly one Lambda per resource+method.**
   Repointing an existing route can silently orphan an existing branch
   (`GET /digests`'s `?sourceHash=` branch was nearly broken this way).
   Grep the frontend for every call to a path before repointing it; diff
   the API surface, not just Lambda/IAM.
2. **New API Gateway resources need an explicit route** —
   `.addResource().addMethod()`, not just building/wiring IAM for the
   Lambda. A search function once 404'd for months of dev time because
   the route was never added and requests matched a sibling resource
   instead.
3. **`Authorization` takes a bare idToken, no `Bearer ` prefix.** Adding
   the prefix causes a bare 401 with **no CloudWatch log line** — the
   authorizer rejects before the Lambda runs. Must be the ID token, not
   the access token. **This applies to any new Fork-A endpoint too.**
4. **A DynamoDB update's `#name` placeholder needs both `#name` and
   `:value`**, or `ValidationException` at call time, not a type error.
   Add the pair together in the same `if` block when adding a conditional
   field — relevant for SourceHealth's new fields.
5. **New clients posting to `/sources` must run the URL through
   `Ingest.extractUrl()`** — share text usually isn't a bare URL. Skip it
   and get a 422 that reads like a fetch failure but is a client bug.
6. **Background toasts are silently swallowed on Android 10+** (§1.10).
7. **`registry.tsx` must keep walking the single flat `digestBlockProps`
   map.** Don't remove the missing-renderer guard.

---

## 4. Fork A — The Sediment Substrate (primary, not yet built)

### 4.1 Core reframe

The act of saving is the signal, not the URL. Fork A accumulates saves
silently; the interesting output is what emerges from accumulation —
tension, clustering, relational connections — not a digest of any one
item. This is the primary product direction going forward.

### 4.2 Pipeline shape (target)

```
share → hash → extract → TL;DR + embed + auto-tag → fold into index
                                   |
                     (SourceHealth check, periodic)
```

`detectThinFetch()` and manual-paste (§1.7, §2 M2 item 3) are the seed of
the SourceHealth check — absorb and generalize, don't rebuild from
scratch:

- Extend `detectThinFetch`'s one-time ingestion check into a **periodic
  recheck** (link rot and paywalls emerge after ingestion, not just at
  save time).
- Add paywall detection as a flag, not a bypass trigger. Custom
  scraper/auth-bypass infra across paywalled sites was evaluated and
  rejected — maintenance burden, conflicts with accumulation-before-AI
  sequencing (§4.5).
- Manual-paste is already the approved override path; extend it with an
  optional per-source authenticated cookie for the paywall case.
- Governing rule: **"stop and ask for better material rather than fake
  completeness"** (from DeepPaperNote evaluation).

### 4.3 TL;DR and the shared extraction structure — the fork bridge

- **TL;DR**: a Source-level field, generated once at ingestion, one cheap
  LLM call per source. Distinct from Fork B's `digestGoal: tl_dr` (§1.6)
  — same word, different artifact. Serves the emergence feed, recall
  citations, and the compact-index tier for chat-with-corpus.
- **Extraction structure** (KeyPoints, Statistics, QuoteBlocks, Themes):
  also a Source-level artifact, computed once via deterministic
  extraction — not per-Digest, not per-fork.
- **Concretely, for Fork B:** today, Fork B's spec generation (§1.5)
  presumably works from raw source content. The migration path is to
  have it read from the shared extraction structure instead — all
  digest-type/tone/length variants become templated transforms over one
  extraction, rather than independent LLM generation calls per variant.
  This is not required for Fork B to keep functioning today, but it's
  the concrete mechanism behind "Fork B can build rendered digests from
  already-made TL;DR/summary segments" — worth doing specifically
  _because_ it means Fork B keeps working even in stretches where Fork A
  has all the engineering attention.
- Validated by three independent sources: this project's own history
  (§1.9's "2 calls not 1 or 3" instinct is a smaller-scale version of the
  same idea), `docling-graph`, `book-to-skill`.
- **Citation provenance should be structural, not post-hoc** — built into
  generation (tool calls/structured output), not a separate verification
  call. Supersedes the originally-scoped standalone "claim verification
  pass" (adapted from AutoResearchClaw). Also directly builds the
  citation model Paper (§4.7) needs later.

### 4.4 DigestMeta stays separate

`DigestMeta` (type/tone/length/date per generation) is Fork B's own
metadata about a specific generated Digest — confirmed as staying
separate from TL;DR, not merged into it. Different fork, different
owner, different lifecycle (TL;DR: once per Source; DigestMeta: once per
Digest, and Digests are cheap/disposable/regenerable).

### 4.5 Accumulation-before-AI (governing sequencing principle)

Substrate infrastructure — topic auto-tagging, near-duplicate collapsing,
embeddings — must be complete **before** AI capability features — tension
detection, Paper clustering — are layered on top. AI against a messy,
untagged, duplicate-heavy pile produces unreliable results. The single
most important sequencing constraint for Fork A.

### 4.6 Personal interest profile (horizon item, sequenced)

- Nearly free once sources are embedded/tagged/clustered — the profile
  _is_ the cluster centroids + weights + recency. A derived view, not new
  infra.
- **Rejected:** save-time "this looks interesting" pop-ups — the signal
  came from the user's own save; echoing it back is noise. Save-time
  reactions must be **relational** ("connects to 4 things you saved" /
  "contradicts something from March"). `inferSourceMode` (§2, M2 item 2)
  is already a narrow, Fork-B-scoped version of this relational instinct
  — worth generalizing into Fork A rather than building fresh.
- Sequencing: (1) near-term — explicit stored profile, ranks emergence
  events; (2) later — inbound discovery (profile scans unsaved
  RSS/newsletters, flags matches); (3) end-game, design-for-don't-build —
  company-wide/multi-user cross-referencing.
- **Concrete requirement now:** keep user-scoping clean and explicit in
  the Sources-table key design so a second user is additive later, not a
  migration. Cheap now, expensive to retrofit.

### 4.7 Paper entity (Track 3) — parked behind Fork A substrate

- Multi-source research documents with structural citations. Parked
  until Fork A's substrate (auto-tagging, dedup, embeddings, extraction
  structure) is solid.
- Schema shape decided in advance: **its own DynamoDB table** (not a
  single unified table — consistent with the three-fork-scoped-tables
  decision, §5.1), join items linking Paper→Sources with a GSI for
  bidirectional lookup, deterministic citation model stored structurally
  on join items.
- Prior art: `docling-graph` (provenance pattern), `book-to-skill`
  (tiered representation, incremental re-indexing), `DeepPaperNote`
  ("stop and ask" rule → SourceHealth), `Hyper-Extract` ("Incremental
  Evolution," corroborates backburner clustering idea).

### 4.8 Other horizon items

- **Share-sheet PWA:** re-scope as the third client on an already-proven
  `POST /sources` contract (web, Android, CLI already do this) rather
  than a from-scratch design. Not urgent.
- **GSI decision:** whether direct Digest lookup by ID needs a GSI —
  independent of the fork debate now that tables are staying separate
  (§5.1); revisit whenever Fork B's needs make it concrete.

---

## 5. Cross-Fork Decisions

### 5.1 Settled

- **Data model:** S3 as source of truth for raw + extracted Source
  content, keyed by `contentHash`. Three fork-scoped DynamoDB tables:
  **Sources** (Fork A index: metadata, SourceHealth, tags, embeddings,
  TL;DR, S3 pointer), **Digests** (Fork B output store, unchanged), and a
  future **Papers** table (Track 3, still parked). No single-table
  migration.
- **Frontend framework:** Next.js (shipped) → Vite SPA (decided). Next.js's
  SSR/ISR/edge/image-optimization features are irrelevant to a fully
  Cognito-gated app with no public surface and a backend already owned by
  `apps/infra` Lambda; static-export Next.js would forfeit those benefits
  anyway while still paying Next's bundle/config overhead, so Vite wins
  outright. **Fold this migration into whatever Fork-A-adjacent
  `apps/web` work happens first** (e.g., building the emergence feed UI),
  rather than treating it as a separate project.
- **LLM stack:** direct Gemini+Bedrock calls, shared by both forks
  (§1.8). Not open — the Vercel AI SDK question is resolved and correct
  as-is.
- **TL;DR vs. DigestMeta:** separate fields, confirmed (§4.4).
- **Rendering pipeline fate:** kept, not retired — Fork B, secondary
  priority, degrades gracefully via the shared extraction structure
  (§4.3).

### 5.2 What's genuinely shared substrate (build once, both forks benefit)

- Cosine-similarity retrieval (§1.4).
- Gemini/Bedrock LLM-calling functions (§1.8).
- Ingestion escape hatches: manual paste, `Ingest.extractUrl()`, thin-fetch
  detection (§1.7, §4.2).
- Cognito auth pattern across web/Android/CLI (§1.10, §1.11).
- The eventual extraction structure + TL;DR (§4.3) — this is the one
  that's new, and is the actual bridge between forks, not just
  incidentally shared.

### 5.3 What stays fork-specific, deliberately

- Fork A: SourceHealth, tagging, personal interest profile, emergence,
  recall, Paper.
- Fork B: the block catalog, `registry.tsx`, json-render/RFC-6902,
  `digestGoal`/`sourceMode` axes, `DigestMeta`, Explore-agent.

---

## 6. Decision Log (condensed, chronological)

| When      | Decision                                                                                                                                                                         | Status                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pre-Aug   | Two-axis catalog, 25 rendered blocks, json-render Spec tree                                                                                                                      | Shipped — Fork B, **kept**                                              |
| Pre-Aug   | DynamoDB two tables (Sources, Digests) over Postgres/Aurora (free-tier)                                                                                                          | Extended to 3 fork-scoped tables + S3 (§5.1)                            |
| Pre-Aug   | Native DynamoDB vector index tried, reverted (6 documented failure modes)                                                                                                        | Settled, shared substrate                                               |
| Pre-Aug   | Flat `DigestBlock[]` tried, replaced by nested Spec tree                                                                                                                         | Settled — Fork B                                                        |
| Pre-Aug   | Vercel AI SDK dropped — retry logic burned Gemini quota meant for fallback                                                                                                       | Settled, shared substrate                                               |
| Pre-Aug   | Metadata kept as 2 separate model calls; agentic loop rejected                                                                                                                   | Settled — Fork B, instinct informs Fork A                               |
| Pre-Aug   | Android auth via Amplify/Cognito SRP, not API key                                                                                                                                | Settled, shared substrate                                               |
| Aug 16    | Topic auto-tagging + near-dup collapsing prioritized as substrate                                                                                                                | Fork A, not yet built                                                   |
| Aug 21–27 | Prior-art evals (docling-graph, book-to-skill, DeepPaperNote, AutoResearchClaw, Hyper-Extract)                                                                                   | Filed, see §7                                                           |
| Aug 27    | Extraction/generation split promoted to primary generation architecture                                                                                                          | Fork A, becomes the fork bridge (§4.3)                                  |
| Aug 27–29 | Sediment reframe: attention ledger, emergence/recall primary                                                                                                                     | Decided — **scope corrected in this doc: two forks, not a replacement** |
| Aug 29    | Personal interest profile sequencing; multi-user parked, key-design requirement now                                                                                              | Fork A, not yet built                                                   |
| Aug 30    | Paywall bypass infra rejected; SourceHealth + manual override adopted                                                                                                            | Fork A, close to shipped already via `detectThinFetch`                  |
| Sep 3     | Full STATUS.md read: Next.js frontend, Android app, richer detail throughout                                                                                                     | Confirmed ground truth                                                  |
| Sep 3     | v1/v2 of this doc: assumed rendering-layer retirement                                                                                                                            | **Superseded**                                                          |
| Sep 3     | Next.js → Vite resolved                                                                                                                                                          | Settled (§5.1)                                                          |
| Sep 3     | **Two-fork architecture decided**: Fork A primary, Fork B kept as proto/POC, bridged via shared extraction structure; S3 as source of truth; TL;DR/DigestMeta confirmed separate | **Current — this doc**                                                  |

---

## 7. Prior-Art Evaluation Table (reference)

| Repo                | Verdict                                                  | Transferable signal                                                                                |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| docling-graph       | Ruled out (wrong problem)                                | Deterministic provenance pattern → Paper citation model, also informs §4.3's structural provenance |
| book-to-skill       | Backburner (post-Paper)                                  | Tiered representation; extraction/generation split validation; incremental re-indexing             |
| DeepPaperNote       | Ruled out (scope mismatch, no provenance layer)          | "Stop and ask for better material" → SourceHealth                                                  |
| Understand-Anything | Validation, not new direction                            | Confirms deterministic extraction + fingerprinting patterns                                        |
| AutoResearchClaw    | Ruled out (superseded by structural-provenance decision) | Claim-verification framing, generalized into §4.3                                                  |
| Hyper-Extract       | Ruled out                                                | "Incremental Evolution" → corroborates backburner Paper clustering                                 |
| webclaw             | Deferred                                                 | Revisit only if Firecrawl costs/limits become a real problem                                       |
| OmniParse           | Ruled out                                                | —                                                                                                  |

---

## 8. What's Deferred vs. What's Important (Phase 2/3 priorities)

### Important now

1. **Introduce S3 as content source of truth** (§5.1) — do this before
   SourceHealth's periodic recheck needs somewhere durable to point to.
2. **Build the extraction structure + TL;DR as Source-level artifacts**
   (§4.3) — this is the fork bridge; get it right once since both forks
   depend on it.
3. **SourceHealth v1**: absorb `detectThinFetch()` + manual-paste (§4.2),
   add periodic recheck + paywall flag + cookie override.
4. **Substrate**: topic auto-tagging, near-duplicate collapsing — must
   land before tension detection, clustering, or Paper (§4.5).
5. **Migrate `apps/web` off Next.js to Vite** (§5.1) — fold into the
   first Fork-A UI work (e.g., emergence feed) rather than a standalone
   migration project.
6. **Point Fork B's generation at the shared extraction structure**
   (§4.3) once it exists — not urgent day one, but do it before Fork A
   work absorbs sustained engineering attention, so Fork B doesn't
   silently degrade in the meantime.

### Deferred / parked (correctly, don't pull forward)

- Paper entity (Track 3) — behind full Fork A substrate completion (§4.7).
- Multi-user / cross-referencing — design-for via key scoping now, don't
  build (§4.6).
- Inbound discovery (profile scans unsaved streams) — after near-term
  explicit-profile step (§4.6).
- File upload ingestion hatch, statistical thin-fetch threshold (Part B)
  — both gated on volume thresholds not yet reached.
- `allowedBlockTypes` (Fork B) — genuinely just deferred now, re-read
  only on observed model misuse (§2).
- Progressive streaming, S3 Glacier _lifecycle policy_ (distinct from
  S3-as-source-of-truth, §2), image/OCR — parked, no new information
  changes this.
- Explore-agent — stays exactly as-is; no retargeting needed (§2, item 5).
- webclaw — revisit only if Firecrawl becomes a real constraint.

---

## 9. Suggested Sequencing for Claude Code (Phase 2/3)

Suggested order, not a locked plan — have Claude Code propose its own
implementation plan against this doc.

1. **S3 source-of-truth layer**: raw + extracted content per
   `contentHash`. Update Sources table to point into it rather than (or
   alongside) however content is stored today.
2. **Extraction structure + TL;DR**: one deterministic extraction call
   and one TL;DR call per Source, at ingestion, stored on the Sources
   table / S3. This is the fork bridge — build it carefully.
3. **SourceHealth v1**: absorb `detectThinFetch()` + manual-paste, add
   periodic recheck + paywall flag + cookie override.
4. **Vite migration**: fold into the first piece of new Fork-A-facing UI
   work in `apps/web` (e.g., wherever the emergence feed will live).
5. **Substrate**: topic auto-tagging + near-duplicate collapsing.
6. **Point Fork B at the shared extraction structure** (§4.3) — swap its
   generation step to read from the Source-level extraction instead of
   raw content, proving Fork B keeps working independent of Fork A's
   ongoing pace.
7. **Emergence feed v1**: TL;DR + relational reactions ("connects to,"
   "contradicts"), built on cosine-similarity substrate and generalized
   `inferSourceMode` (§4.6) — no new clustering infra yet.
8. **Personal interest profile v1** (derived from clusters, ranks
   emergence).
9. **In parallel, whenever convenient**: finish push-source CLI
   end-to-end wiring; Share-sheet PWA re-scope (§4.8) if it becomes
   needed.
10. **Only after 1–8 are solid**: tension detection / topic clustering,
    then the Paper entity spec, then its own table + join-item GSI.

---

## 10. Open Questions to Resolve Before Kickoff

- None blocking at the architecture level — the two big open questions
  from v2 (frontend framework, table shape) are both resolved (§5.1).
- Worth deciding, not blocking: does the S3 source-of-truth layer (§9,
  step 1) replace how content is stored today, or run alongside it during
  a transition period? Recommend Claude Code propose this as part of its
  implementation plan rather than deciding it here.
- Is the file-upload ingestion hatch (HTML/PDF) worth pulling forward now
  that it overlaps conceptually with SourceHealth's manual override, or
  does it stay gated on volume as originally planned?
