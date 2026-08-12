# Self-expanding tag vocabulary with fuzzy matching

**Status:** proposed — not started.

**Goal:** stop `DigestMeta.tags` from fragmenting into near-duplicate spellings
(`"CSS"` / `"css"` / `"Css"`, `"Design Systems"` / `"design-systems"` /
`"DesignSystems"`) as more digests get generated, without building a real
taxonomy or adding a second embedding call per tag.

## Why this exists

`packages/catalog/src/page/DigestMeta.schema.ts` deliberately makes `subject`
a small curated enum but leaves `tags` as free-ish strings (1-6 per digest) —
see the schema's own comment: reliability matters for the primary filter
(`subject`), but tags are the secondary search/refinement layer where
"occasional inconsistency matters less." `plans/phase-3-browse-search.md`
already named the risk and sketched a fix (a `TagsTable` keyed by normalized
tag name, shown to the model at generation time so it prefers reusing an
existing tag) but that table was never built — `apps/infra/lambdas/generate-digest/handler.ts`'s
`generateMeta()` (added when Phase-3 step 6 was implemented, see
`wiki/current-work.md`) generates `tags` with no vocabulary awareness at all
today. This plan is that deferred piece, made concrete, plus the fuzzy-matching
layer that came up when reviewing what "prefer reusing an existing tag" alone
would actually catch.

The existing plan's normalization (`lowercase/trim`) only catches exact
duplicates after casing differences. It does not catch punctuation/whitespace
variants (`"design-systems"` vs `"Design Systems"`) or near-typos the model
might still produce despite being shown the vocabulary — LLMs are shown the
list and asked to prefer it, but "prefer" is not "guaranteed," and a small
string-level safety net is cheap insurance under an already-cheap mechanism.

## Two matching layers

1. **Normalization (deterministic, no threshold).** Before storing or
   comparing, collapse `lowercase + trim + strip punctuation
   (hyphens/underscores/extra whitespace) → single-space-joined words`. This
   alone merges `"Design Systems"`, `"design-systems"`, `"Design  Systems"`
   into one key. Cheap, exact, no false-positive risk — do this
   unconditionally.
2. **Fuzzy match against the existing vocabulary (edit-distance, threshold).**
   After normalizing, if the exact normalized key isn't in `TagsTable`, check
   Levenshtein distance against existing keys; treat distance ≤ 2 (tunable)
   as a match onto the existing tag rather than minting a new one. Catches
   near-typos (`"typescrpit"` → `"typescript"`) and light pluralization
   (`"css grid"` vs `"css grids"`) that survive normalization. Runs in Lambda
   code, no external service — vocabulary size at personal-bookmark scale
   (dozens to low hundreds of tags) makes an O(vocabulary × avg tag length)
   scan trivial.

**Explicitly not doing:** embedding-based semantic tag merging (comparing tag
text embeddings via cosine similarity to catch true synonyms like `"IaC"` vs
`"Infrastructure as Code"`). That's a real capability gap this plan leaves
open, but it costs an extra Bedrock call per tag and is solving a precision
problem this project doesn't have yet at this corpus size — the model already
does *semantic* matching for free by being shown the vocabulary and asked to
reuse it; embeddings would only help with synonyms the model itself missed,
which hasn't been observed as a real problem. Revisit if/when the tag list
grows large enough that eyeballing "did this fragment" stops being easy, or if
review of stored tags shows the model regularly missing obvious synonyms.

## Data model: `TagsTable`

New DynamoDB table, on-demand billing, no GSI needed (small enough to scan
whole for the fuzzy-match check and for Browse's autocomplete):

- PK: `normalizedTag` (String) — the deterministic-normalization output.
- `displayTag` (String) — casing to show in the UI. See "Casing conflicts"
  below for which write wins.
- `count` (Number) — usage count, incremented on every digest that uses this
  tag (post-fuzzy-match, i.e. a fuzzy-matched near-typo increments the
  *existing* tag's count, not a new row).
- `firstSeenAt` / `lastUsedAt` (String, ISO) — mild debugging/curation aid;
  not load-bearing for matching.

## Casing conflicts — decision needed before building

If the model returns `"Design systems"` and the stored row already has
`displayTag: "Design Systems"`, which casing wins? Recommendation: **first
write wins, never overwritten** — `displayTag` is set once on insert and
never changed by later upserts, only `count`/`lastUsedAt` update. Rationale:
stability matters more than "most recent" here — a tag's display casing
changing over time as more digests come in would be a more confusing UI
surprise than one imperfect casing choice made early and kept. This is a
5-minute decision to confirm, not a design problem, but it needs an explicit
answer (not left implicit in the upsert code) before implementation starts.

## Generation-time flow

In `generate-digest/handler.ts`'s `runGeneration`, around the existing
`generateMeta()` call (single-source only, per the current implementation):

1. **Before calling `generateMeta`**: scan `TagsTable`, sort by `count` desc,
   take the top ~50-100 (or all, if the table is smaller — no pagination
   complexity needed at this scale). Pass the `displayTag` list into
   `generateMeta`'s system prompt: "Existing tags in use: [...]. Prefer
   reusing one of these over inventing a new spelling for the same concept."
2. **After `generateMeta` returns validated `meta.tags`**: for each tag,
   normalize it, check for an exact normalized match, then a fuzzy
   (edit-distance ≤ 2) match against the fetched vocabulary. If either
   matches, rewrite `meta.tags[i]` to that row's `displayTag` (so the stored
   digest carries the *canonical* spelling, not the model's raw output) and
   queue a `count` increment. If neither matches, queue a new `TagsTable`
   insert (count 1, `displayTag` = the model's output as-is).
3. Apply the queued upserts (batch if straightforward, sequential is fine at
   this scale) after the digest itself is successfully saved — tag-vocabulary
   bookkeeping should never block or fail the digest save. Same "non-critical"
   posture the current `generateMeta` failure handling already uses.

## API additions

- **`GET /tags`** (new, small Lambda or folded into an existing static-ish
  endpoint like `digest-goals`) — returns `[{ tag: displayTag, count }]`
  sorted by count desc. Backs Browse's tag filter/autocomplete. No auth
  needed by the same reasoning as `digest-goals` (non-sensitive config-ish
  data) — confirm this against how `list-digests`-equivalent auth is handled
  before assuming, since Browse's other endpoints (`/sources`, `/digests`) do
  require the Cognito authorizer.
- Wire the CDK route explicitly and confirm with `cdk diff` that
  `AWS::ApiGateway::Method` for the new route actually appears — see
  `wiki/gotchas.md`'s note on this exact failure mode from the first Phase-3
  pass (a Lambda + IAM grant with no route is silently unreachable).

## Frontend (`apps/web/src/app/browse/BrowsePage.tsx`)

- Add a `tags` param to `FilterBar` (Digests tab) — likely a multi-select or
  simple text input with autocomplete sourced from `GET /tags`, consistent
  with the existing `digestGoal` dropdown pattern already in that component.
- Extend `fetch-digest`'s `listAll` filter (in
  `apps/infra/lambdas/fetch-digest/handler.ts`) to support a `tags` query
  param — post-scan filter on `meta.tags` containing the requested tag
  (normalized comparison), same pattern as the existing `q` substring filter.

## Sequencing / rough estimate

1. `TagsTable` CDK construct + grants — 20-30 min.
2. `dynamo.ts` helpers (`tagsScan`, upsert) — 30-45 min.
3. Normalization + edit-distance matching helper (pure function, easy to unit
   test in isolation even though this codebase has no existing test suite for
   the lambdas) — 30-45 min.
4. Wire into `generate-digest`: fetch vocabulary, prompt injection, post-call
   upsert — 45-60 min.
5. `GET /tags` endpoint + CDK route (with the `cdk diff` route-existence
   check) — 30-45 min.
6. Browse UI: tag filter + `listAll` `tags` param — 45 min.
7. Manual verification: generate several digests across a couple of topics,
   confirm reuse happens, confirm a deliberately-misspelled tag fuzzy-matches,
   confirm casing stays stable across regenerations — 30-45 min.

**Total: ~4-5 hours.**

## Open questions to settle before/while building

- Edit-distance threshold of 2 is a guess, not measured — may need tuning
  once real tag data exists (too loose merges genuinely distinct short tags
  like `"Go"` / `"Go"` isn't a risk, but `"AI"` / `"UI"` at distance 2 might
  be, depending on the distance function's exact behavior on very short
  strings; consider a minimum-length guard before applying fuzzy match, e.g.
  skip fuzzy matching for tags under ~4 characters and require exact
  normalized match instead).
- Whether `GET /tags` needs auth — check against the other Browse endpoints'
  actual auth wiring rather than assuming from `digest-goals`.
- Multi-source digests still don't get `DigestMeta` at all (a separate,
  already-known gap — see `wiki/current-work.md`), so this plan only affects
  tags on single-source digests until that's addressed.
