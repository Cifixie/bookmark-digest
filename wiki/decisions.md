# Decisions

Durable architectural calls, extracted from `plans/archive/` so the reasoning
survives even though the plan docs themselves are done. See
[[current-work]] and [[gotchas]] for what's live and what's bitten us.

**2026-09-03:** the project pivoted to a two-fork architecture. The decisions
below still hold — most of them are now Fork B's, or shared substrate. The
pivot's own decisions are grouped at the end of this file under "Phase 2/3
pivot". Structural reference: `docs/two-fork-architecture.md`.

## Storage: DynamoDB, not Aurora/pgvector

Target AWS account is on the Free Plan, which can't provision Aurora via CDK
(needs "express configuration," a mode CloudFormation doesn't support).
Pivoted early to DynamoDB: two `TableV2` on-demand tables (`Sources`,
`Digests`), GSIs for dedup/lookup, DynamoDB Streams to trigger embedding
instead of direct Lambda invoke. No VPC, no connection pooling, no cold-start
warmup. See `plans/archive/dynamodb-migration.md`.

## Semantic search: brute-force cosine, not a vector index

DynamoDB's native `SearchVectors` was built, found broken, and reverted — see
[[gotchas]] for the six concrete failure modes (no `<>` operator, inverted
score semantics, no backfill-wait, fixed dimensions, silently-swallowed
fallback). **Decision: brute-force cosine similarity scan stays** at
personal-bookmark scale (thousands of rows is still a cheap scan). Revisit
only when a scan measurably hurts, starting from the six documented failure
points, not from scratch.

## Two independent generation axes: `digestGoal` and `sourceMode`

Depth/voice (`tl_dr`/`summary`/`understand`) and multi-source shape
(`synthesize`/`compare`/`evolution`) are separate axes, composed
goal-template → mode-template → `GROUNDING_RULES` → `catalog.prompt()` in the
*system* prompt. The user turn carries only source material. This exists
because asserting comparison for every multi-source bundle produced wrong
shapes for complementary sources (two articles by one author). `sourceMode`
is **deliberately not inferred** from source count/content — that inference
is the same judgment call that produced the wrong shape originally. See
CLAUDE.md's "Digest Generation: Two Independent Axes" section for the full
model; this entry just records *why* it's two axes and not one.

## Naming: `digestGoal` vs `digestType`

`digestGoal` (schemas package) answers "what should the digest do." `digestType`
(catalog package, `article`/`video`/`podcast`/...) classifies the *source*.
Deliberately not merged — different axis, different owner.

## Content model: json-render's native Spec tree, not a flat block array

`generate-digest` originally produced a flat `DigestBlock[]`. Switched to
json-render's native nested `Spec` tree (`{root, elements}`, RFC-6902
patch-compiled) because that's what `catalog.prompt()` actually describes —
the flat schema was silently causing schema-minimum output (empty props).
The library's own catalog-wide schema does **not** enforce per-component
props once a catalog has >1 component (falls back to
`z.record(unknown)`) — per-type props validation is layered on top via
`validateDigestSpec`, it isn't free from adopting the tree model. See
`plans/archive/commit-to-render-json.md`.

## Registry throws on a missing renderer

`apps/web/src/lib/registry.tsx` throws at module load if any catalog block
type has no registered component. This exists because three blocks
(`ComparisonTable`/`AuthorCard`/`TimelineEvent`) shipped registered-but-
unrendered for three commits before anyone noticed. Don't remove this guard;
don't let a future multi-catalog refactor read from anything other than the
single flat `digestBlockProps` map it walks.

## Disambiguation between overlapping blocks: prompt text, not a gating mechanism

`Chart` vs `StatCard`/`ComparisonTable`, `PullQuote` vs `QuoteBlock`,
`ComparisonNarrative` vs `ComparisonTable`/`Grid`/`TimelineEvent` — all
handled via prompt-text guidance in `digest-goals.ts`, not a block allowlist.
A per-goal/mode `allowedBlockTypes` filter (or multiple `defineCatalog()`
calls) was designed twice and deliberately not built both times — see
`plans/multi-catalog-gating.md` (kept as a live deferred plan, not archived,
since its trigger condition hasn't fired yet). Building it before real
misuse is observed would be speculative infrastructure for a problem that
may not exist.

## Ingestion escape hatches exist because remote fetch loses fidelity

Firecrawl (the default fetcher) sometimes returns page chrome instead of
content (a YouTube watch page: nav/sign-in/view-counts, no transcript) or
silently drops link targets (a citation list rendered as plain text, no
`href`). Two escape hatches exist/are planned for the same underlying
problem — "the source is fine, the remote fetch isn't":
- **Manual paste** (shipped) — `POST /sources` accepts `content` directly,
  `fetchedBy: "manual"`.
- **File upload** (planned, now `plans/source-health.md`) — same idea,
  HTML/PDF instead of pasted text, so real link targets survive.

YouTube-specific transcript fetching (InnerTube caption endpoint) was tried
*in* the Lambda and reverted — works from a residential IP, silently returns
no captions from Lambda's shared IP ranges. Survives only as a local CLI
script (`apps/infra/scripts/youtube-transcript.ts`) feeding the manual-paste
path.

## Tag reliability split: `subject` is a curated enum, `tags` is free text

`DigestMeta.subject` is a small curated enum because it's the primary browse
filter — inconsistent spellings there would fragment the top-level filter.
`tags` stays free-ish (1-6 strings) because it's a secondary refinement layer
where occasional inconsistency is an acceptable cost for not needing a real
taxonomy. The self-expanding vocabulary table to keep `tags` from fragmenting
anyway is designed but not built — `plans/digest-metadata-completeness.md`.

## Second model call for metadata is deliberately still 2 calls, not 1 or 3

Spec generation and `generateMeta()` (subject/tags/synopsis/...) are
separate model calls. Rejected: merging into the Spec-generation call
(couples failure modes, competes for context/attention on the harder task).
Rejected: an agentic tool-calling loop for the whole pipeline (no real
branching exists in the sequence to justify the indirection/cost — the
repair logic, `autoFixSpec`/null-stripping/dangling-ref pruning, is exactly
the kind of thing that should stay deterministic code).

## The Vercel AI SDK was dropped for direct provider calls

`generate-digest` used `ai` + `@ai-sdk/google` + `@ai-sdk/amazon-bedrock`
for two providers and exactly one call shape (system + prompt + maxTokens +
temperature, text back). The abstraction cost more than it saved:

- **Its retry logic fought the quota fallback.** The SDK retried transient
  failures itself and wrapped the cause in a `RetryError` whose top-level
  `.message` had no "429"/"RESOURCE_EXHAUSTED" in it, so `isQuotaExceeded()`
  had to regex both the outer message *and* the nested `.errors[]`. Worse,
  those silent retries spent free-tier Gemini quota that the Bedrock fallback
  exists precisely to conserve.
- **Bedrock already had a raw path.** `embedText()` called Titan through
  `InvokeModelCommand` directly, so half the Lambda bypassed the SDK anyway.

Both providers are now one function each — `callGemini()` (a single JSON POST
to `generativelanguage.googleapis.com`) and `callBedrockClaude()`
(`InvokeModelCommand` with the Anthropic Messages body) — normalizing to a
shared `LlmResult`. Quota exhaustion is a real `GeminiQuotaError` thrown on
HTTP 429 / `RESOURCE_EXHAUSTED` rather than a regex guess, and `withOneRetry`
retries 5xx only, never 429.

The tradeoff accepted: response parsing is now ours to maintain (Gemini's
`candidates[0].content.parts`, Bedrock's `stop_reason` naming), and adding a
*third* provider would mean a third hand-written adapter. Worth revisiting
only if that third provider shows up — two providers × one call shape is
below the threshold where a provider abstraction pays for itself.

## The Android share target signs in with Cognito rather than getting an API key

`POST /sources` is behind the Cognito User Pool authorizer like every other
route except `/digest-goals`. The tempting shortcut for a phone app was to add
`apiKeyRequired` plus a usage plan so the app could send a static `x-api-key`
and stay under 100 lines. Rejected: an API key baked into an APK is trivially
extractable (`unzip` + `strings` on the `BuildConfig` class), it is not scoped
to a user, and rotating it means shipping a new build. It would have punched a
permanent unauthenticated-ish hole in the API to save one screen.

Instead `apps/mobile/android` depends on Amplify Android (`aws-auth-cognito` +
`core-kotlin`) and has a one-time email/password `LoginActivity`. This works
without any stack change because the user pool client is already shaped for a
public mobile client: `generateSecret: false` and `authFlows: { userSrp: true }`.
Amplify does the SRP handshake, caches tokens in EncryptedSharedPreferences,
and refreshes them, so the screen is visited once and the share path is
non-interactive after that. Doing SRP by hand against the AWS SDK was the third
option and is ~150 lines of easy-to-get-wrong crypto.

## The share POST runs in WorkManager, not a coroutine in the activity

`ShareActivity` is `Theme.NoDisplay` and calls `finish()` immediately so the
share sheet closes instantly. That leaves no foreground component, and a
Firecrawl scrape behind `POST /sources` routinely takes 10-30s (the Lambda is
given a 5-minute timeout). A plain coroutine in that activity would be racing
process death on a loaded phone and would drop shares silently.

`IngestWorker` also owns the auth check, not the activity — reading the Cognito
session hits EncryptedSharedPreferences and may refresh over the network, so it
cannot be on the main thread, and doing it before `finish()` reintroduces the
same race.

Originally this meant an unauthenticated share could only toast "sign in to
save links," leaving the user to open the app from the launcher themselves —
but that cost turned out to be avoidable, not fundamental: a *notification*
(unlike a toast) can carry a `PendingIntent` and launch an activity from the
background even though the worker posting it cannot launch one directly. See
[[gotchas]] for why toasts had to go entirely (they're silently swallowed
once the activity is gone, not just for the sign-in case), and
`IngestNotifications` in [[current-work]] for the fix.

The `NetworkType.CONNECTED` constraint is a bonus: a link shared with the radio
off is delivered when connectivity returns instead of being lost. See
[[gotchas]] for the URL-extraction trap that goes with this.

---

# Phase 2/3 pivot (2026-09-03)

Decided in the handoff conversation captured at `raw/HANDOFF.md`, processed
into `docs/two-fork-architecture.md` and the plans under `plans/`. The raw
handoff is not maintained.

## Two forks, not a replacement — the rendered digest pipeline is kept

The new direction (Sediment: accumulation, emergence, recall) does **not**
retire the rendered-digest product. Two earlier drafts of the pivot assumed it
did — that `packages/catalog`, `registry.tsx`, the json-render Spec tree, and
RFC-6902 patches would be deleted. That framing is superseded.

- **Fork A** (Sediment substrate) is primary and gets engineering priority
  when the two compete for time. New work defaults here.
- **Fork B** (the rendered digest pipeline) is secondary and kept
  deliberately — framed as a good proto and proof-of-concept, worth
  preserving rather than deleting. It gets the maintenance it genuinely needs
  and not priority.

Consequences that are easy to get wrong: `registry.tsx`'s missing-renderer
guard has **permanent** value, not value-until-retirement. And
`plans/multi-catalog-gating.md` is *un-cancelled* — an earlier draft called
`allowedBlockTypes` moot once rendering was retired; since rendering isn't
being retired, it's legitimately still just deferred-with-a-trigger.

The thing that makes this workable rather than "run two products" is the
bridge below. Without it, keeping Fork B alive would mean maintaining two
independent content pipelines, which is the version of this decision that
would have been wrong.

## The fork bridge: TL;DR and extraction structure live once, on the Source

The Source-level TL;DR and the deterministic extraction structure
(`KeyPoints`, `Statistics`, `QuoteBlocks`, `Themes`) are **Source-level
artifacts computed once at ingestion**, not re-derived per Digest and not
owned by either fork.

Fork B's generation should read from that shared structure rather than raw
source content, which turns digest-type/tone/length variants into templated
transforms over one extraction instead of independent generation calls.

The real reason isn't cost, it's resilience: it's the mechanism by which Fork
B **degrades gracefully**. If Fork A absorbs sustained engineering attention,
Fork B can keep producing rendered digests from already-made TL;DR/summary
segments without independent raw-content access. Fork B stops rotting when
nobody's looking at it.

Independently arrived at three times — this project's own "2 model calls, not
1 or 3" instinct (above), plus the `docling-graph` and `book-to-skill`
evaluations (`plans/prior-art.md`). Plan: `plans/extraction-and-tldr.md`.

## `Source.tldr` and `DigestMeta` stay separate fields

Considered and rejected: merging them.

- `Source.tldr` — one per Source, generated once at ingestion, Fork A's.
- `DigestMeta` — type/tone/length/date per *generation*, one per Digest,
  Fork B's. Digests are cheap, disposable, and regenerable; Sources are not.

Different fork, different owner, different lifecycle. Merging them would tie a
permanent artifact's schema to a disposable one's.

Related naming trap, worth its own warning: `digestGoal: "tl_dr"` (a shipped
`packages/schemas` enum value meaning "make this digest shallow") predates and
is unrelated to `Source.tldr`. Same word, different artifact. Don't share a
type, helper, or prompt template between them.

## Citation provenance is structural, not a post-hoc verification pass

Provenance is built into the extraction call via structured output — each
extracted item carries where in the source it came from — rather than added
afterward by a separate verifier. This **supersedes** the originally-scoped
standalone claim-verification pass (adapted from the `AutoResearchClaw`
evaluation, now ruled out).

Two reasons: a post-hoc verifier is a second thing that can be wrong about the
same content, and the structural version *is* the citation model the `Paper`
entity needs later. Building it in the extraction call does Paper's hardest
part early and cheaply.

## Data model: S3 as source of truth, three fork-scoped tables

This closes the single-table-vs-two-table debate that ran through earlier
drafts of the pivot, and closes it more simply than either option being
debated.

- **S3**, keyed by `contentHash` — canonical raw + extracted content. A
  permanent archive that survives the origin URL dying.
- **Sources** (DynamoDB) — Fork A's *index*: metadata, SourceHealth, tags,
  embeddings, TL;DR, pointer into S3.
- **Digests** (DynamoDB) — Fork B's output store, unchanged.
- **Papers** (DynamoDB, future) — same pattern, own table, join items back to
  Source.

No single-table migration. Three pressures pointed at this independently:
SourceHealth's periodic recheck needs a durable original to compare against;
the extraction structure needs a stable, re-computable input; and `content`
sitting inline next to a multi-hundred-float `embedding` is already why
`lib/dynamo.ts`'s scan helper warns to always pass a `projectionExpression`.

Note this is **not** the parked S3 Glacier item — that's a cost policy layered
on storage that would have to already be in S3. Plan:
`plans/s3-source-of-truth.md`.

## Transition: run S3 alongside inline content, then backfill, then drop

Not a cutover. Add the S3 write while still writing `content` inline → one
`getSourceContent()` accessor that prefers S3 and falls back to inline →
backfill script → separate later deploy that removes the inline copy.

The fallback costs about four lines and makes each step independently
shippable. A cutover would require the backfill to finish before any reader
deploys — which is precisely the "no way to wait for backfill to finish"
failure that got the native DynamoDB vector index reverted (see [[gotchas]]).
Don't rebuild that sequencing trap in a different service.

## Accumulation before AI (governing sequencing constraint for Fork A)

Substrate infrastructure — topic auto-tagging, near-duplicate collapsing,
embeddings — must be complete **before** AI capability features — tension
detection, Paper clustering — are layered on top.

AI run against a messy, untagged, duplicate-heavy pile produces unreliable
results, and the failure is insidious rather than loud: the feed doesn't
crash, it surfaces junk connections and trust erodes quietly. This is the
single most important sequencing constraint for Fork A, and why
`plans/substrate-tagging-and-dedup.md` is a hard gate rather than a queue
position.

Corollary: the tag-vocabulary anti-fragmentation table designed but never
built for Fork B (`plans/digest-metadata-completeness.md`) becomes mandatory
for Fork A. A fragmented tag is a mildly worse browse filter for Fork B; for
Fork A it's two clusters where there should be one.

## Paywall bypass infrastructure rejected; flag + manual override adopted

Custom scrapers / auth-bypass across paywalled sites was evaluated and
rejected: per-site maintenance burden, and it competes for time with the
substrate work that everything else is gated on. SourceHealth detects and
*flags* paywalls; remediation is the already-approved manual-paste path, plus
file upload, plus an optional per-source authenticated cookie for the
legitimate-subscriber case.

Governing rule, from the `DeepPaperNote` evaluation: **stop and ask for better
material rather than fake completeness.** SourceHealth's job is to make
"ask for better material" actionable rather than a dead end — which is also
why file upload gets pulled forward into SourceHealth v1 rather than staying
queued behind it (`plans/source-health.md`).

## Save-time reactions must be relational, never evaluative

Rejected: save-time "this looks interesting" popups. The signal came from the
user's own save; echoing it back is noise.

A reaction is only worth surfacing if it's *relational* — "connects to 4
things you saved", "contradicts something from March", "third thing on this
topic in two weeks". `inferSourceMode` (shipped) is already a narrow,
Fork-B-scoped version of this instinct; generalize it into Fork A rather than
writing a fresh heuristic.

Caveat carried over from that heuristic's own history: asserting a
relationship that isn't there produces wrong output. v1 should claim only what
cosine similarity plus tags actually support ("connects to", "same cluster").
"Contradicts" is the most compelling row type and the easiest to be
embarrassingly wrong about — it waits for `Statistics` disagreement or a real
tension pass.

## The name is Sediment; the repo stays bookmark-digest

The product direction and Fork A are called Sediment. The repo, pnpm packages
(`@bookmark-digest/*`), CDK stack (`BookmarkDigest`), and physical resource
names stay as they are — renaming the stack would mean replacing retained,
deletion-protected tables for a cosmetic gain. "Sediment" is a name, not a
rename task.

## User scoping goes into key design now, multi-user is not built

Multi-user / company-wide cross-referencing is explicitly design-for-don't-
build. The one thing that lands now: any new GSI, scan, or endpoint added for
tagging, clustering, or the feed carries an owner dimension in its key even
while there's exactly one owner, and reads the owner from the Cognito claim
rather than treating the corpus as global.

Cheap now, expensive to retrofit. The honest open tension:
`contentHash`-as-PK means one item per piece of content, which is right for
dedup and wrong for per-user ownership. Resolving that is a key-design change,
deliberately not made now — but it should be made deliberately rather than
discovered. See `plans/interest-profile.md`.

## Not decisions — two handoff claims corrected against the repo

Recorded here because both were stated as settled decisions in
`raw/HANDOFF.md` and neither is real:

1. **There is no pending Next.js → Vite migration.** `apps/web` is already a
   Vite SPA: `"dev": "vite"`, `react-router-dom` with `src/app/router.tsx`,
   `src/main.tsx` calling `createRoot`, and no `next` dependency in any
   `package.json`. The Next-style `page.tsx` / folder-per-route naming under
   `src/app/` is a cosmetic leftover convention and is presumably what caused
   the confusion.
2. **File upload was never gated on source volume.** Only the *statistical*
   signal-density thin-fetch layer is corpus-gated.
   `plans/source-quality-and-upload.md` uses "Part B" for two different things
   — signal-density scoring and file upload — which is where the conflation
   came from.
