# Digest metadata completeness

**Status:** proposed — not started. Item 1 in `plans/ROADMAP.md`'s queue.

**Supersedes:** `digest-synopsis-and-model-tiering.md` and
`tag-vocabulary-fuzzy-matching.md` (both folded in here — see "Why merged"
below). If you're looking for either of those by name, this is where they
live now.

**Goal:** make `DigestMeta` (subject/tags/synopsis/etc.) actually complete —
generated for multi-source digests too, not fragmenting into near-duplicate
tag spellings, embedded for semantic search, and off Gemini's scarce quota.

## Why merged

All three changes edit the same call site: `generateMeta()` in
`generate-digest/handler.ts`, and the same schema:
`packages/catalog/src/page/DigestMeta.schema.ts`. Building them as three
independent plans risks each one's prompt/schema edit clobbering the others'.
The original synopsis/tiering plan said as much itself ("build together or
sequence deliberately") and proposed an order — this plan keeps that order
and adds the multi-source gap as a fourth, related step since it's the same
function's biggest remaining limitation.

## Current state (verified against the live handler)

- `generateMeta()` exists, runs on Gemini (same quota as the main Spec-
  generation call), and **only for single-source digests**
  (`sourceHashes.length === 1` gate in `runGeneration`).
- No `synopsis` field exists on `digestMetaSchema` — Digests have no
  semantic-search story (Sources do, via `search-sources` +
  `lib/similarity.ts`).
- No tag vocabulary table exists — `tags` are generated with zero awareness
  of prior digests' tags, so near-duplicate spellings (`"CSS"` / `"css"`)
  are free to accumulate.

## Sequencing (do in this order — each step is independently deployable, but this order minimizes rework)

### Step 1 — Move `generateMeta()` to Bedrock Haiku (mechanical, no schema change)

`generate-digest/handler.ts` already has the Bedrock provider, the Haiku
inference-profile ID, and the IAM policy — all provisioned as the existing
fallback path for when Gemini's quota is exhausted on the *main* call.
Change `generateMeta()` to call `bedrock(FALLBACK_MODEL)` unconditionally
instead of `provider(GENERATION_MODEL)`. No fallback logic needed — it's not
falling back to Haiku, it's always Haiku.

Verify: generate a digest, confirm Haiku's JSON output still parses against
`digestMetaSchema` the same way Gemini's did (the existing
`result.text.match(/\{[\s\S]*\}/)` extraction shouldn't need to change, but
confirm rather than assume). Glance at actual Bedrock billing after a week —
expected negligible at this scale, not yet measured.

**Local-model fit:** low — this is a live-call verification step
(confirm real Haiku output parses), not much for Qwen to contribute beyond
reviewing the diff.

### Step 2 — Add `synopsis`, embed it, wire semantic search for Digests

- Add `synopsis: z.string().max(500)` to `digestMetaSchema` — a couple of
  sentences describing what the digest covers, written for a human scanning
  search results.
- Add it to `generateMeta`'s prompt, same call as the rest of `meta`.
- **Generate `synopsis` for multi-source digests too** (unlike `subject`/
  `tags` for now — see Step 4). "What does this digest cover" has a coherent
  answer across N sources the way "what single category is this" doesn't.
- Embed the returned `synopsis` via the same Titan path `embed-source`/
  `search-sources` already use. Store on the Digests table item
  (`embedding` field, mirroring Sources' shape).
- New `GET /digests/search?q=` Lambda + route, mirroring `search-sources`:
  embed the query, scan Digests with an `embedding`, rank via
  `lib/similarity.ts`'s existing `rankBySimilarity`.
- **Before calling this done, run `cdk diff` and confirm the new
  `AWS::ApiGateway::Method` actually appears** — see [[gotchas]] for exactly
  this failure mode from the first Phase-3 pass (Lambda + IAM built, route
  never added, request 404s against a sibling resource).
- Browse UI: same "✦ Semantic" toggle `BrowsePage.tsx` already has for
  Sources, added to the Digests tab.

**Local-model fit:** medium — the Lambda handler and CDK route need
Claude/Pi (route-wiring is exactly the historically-error-prone part), but
drafting the Browse UI toggle component is a reasonable local-model task
given the existing Sources toggle as a reference pattern.

### Step 3 — Tag vocabulary with fuzzy matching

New `TagsTable` (DynamoDB, on-demand, no GSI — small enough to scan whole):

| Attribute | Role |
|---|---|
| `normalizedTag` (PK) | `lowercase + trim + strip punctuation → single-space-joined` |
| `displayTag` | casing shown in UI — **set once on insert, never overwritten** (stability over "most recent casing") |
| `count` | usage count, incremented on every match (exact or fuzzy) |
| `firstSeenAt` / `lastUsedAt` | ISO, debugging aid only |

Two matching layers, applied in order:
1. **Normalization** (deterministic, no threshold) — collapses casing/
   punctuation/whitespace variants into one key. Do this unconditionally.
2. **Fuzzy match** (Levenshtein ≤ 2, tunable) against the existing
   vocabulary, only if the normalized key isn't an exact hit. Catches
   near-typos and light pluralization. Guard: skip fuzzy matching for tags
   under ~4 characters (avoid `"AI"`/`"UI"`-style false merges at short
   lengths) — require exact normalized match for those instead.

**Explicitly not doing:** embedding-based semantic tag merging (catching
true synonyms like `"IaC"` vs `"Infrastructure as Code"`). Costs an extra
Bedrock call per tag for a precision problem not yet observed at this corpus
size. Revisit if review of stored tags shows the model missing obvious
synonyms despite being shown the vocabulary.

Generation-time flow, in `generateMeta`'s caller:
1. Before calling `generateMeta`: scan `TagsTable`, sort by `count` desc,
   take top ~50-100. Inject `displayTag` list into the prompt: "prefer
   reusing one of these over inventing a new spelling for the same concept."
2. After validated `meta.tags` returns: normalize each tag, check exact then
   fuzzy match. On a match, rewrite the tag to the matched row's
   `displayTag` (store the canonical spelling, not the model's raw output)
   and queue a `count` increment. On no match, queue a new insert.
3. Apply queued upserts **after** the digest itself saves successfully — tag
   bookkeeping must never block or fail the digest save (same posture as
   `generateMeta`'s own existing non-critical failure handling).

New `GET /tags` endpoint (small Lambda, backs Browse's tag filter/
autocomplete) — **check the actual auth wiring of `/sources` and `/digests`
before assuming this is unauthenticated** like `/digest-goals`; don't guess
by analogy. Wire the CDK route explicitly and confirm with `cdk diff` per
the same gotcha as Step 2.

Browse UI: add a `tags` param to `FilterBar`'s Digests tab, autocomplete
from `GET /tags`. Extend `fetch-digest`'s list-all filter with a `tags`
query param (post-scan filter on `meta.tags`, same pattern as the existing
`q` substring filter).

**Local-model fit: high.** The normalization + edit-distance matching
helper is a pure function with no AWS dependency — a good Qwen task,
including its unit tests (this codebase has no lambda test suite yet, but a
pure function is easy to test in isolation regardless). The `TagsTable`
CDK construct and route wiring stay with Claude/Pi.

### Step 4 — Multi-source `DigestMeta`

Once Steps 1-3 land, decide whether `subject`/`tags` (not just `synopsis`,
which Step 2 already covers for multi-source) are worth attempting for
multi-source digests. This wasn't decided one way or the other in the
original plans — it was explicitly called out as "a separate, not-yet-
decided question" from the synopsis change. Now that synopsis generation
already has a working multi-source content-summary path (built in Step 2),
reuse it: feed the same summarized multi-source content into the
`subject`/`tags` prompt and see whether a single coherent subject/tag set
makes sense across N sources, or whether it needs its own multi-value
design (e.g. `subjects: Subject[]` instead of one `subject`). Don't assume
the single-source shape transfers — check real multi-source output first.

## Open questions to settle before/while building

- `synopsis` max length (500 chars) is a guess — tune once real output
  exists.
- Edit-distance threshold of 2 is a guess — may need tuning once real tag
  data exists.
- Whether multi-source `synopsis` needs its own source-content truncation
  strategy, or can reuse a much smaller slice than the main generation call
  needs (it's only producing a couple of sentences).

## Verify (each step)

```bash
pnpm --filter catalog test
pnpm --filter catalog typecheck
pnpm --filter infra typecheck
pnpm --filter web typecheck
cd apps/infra && npx cdk diff   # confirm new routes/tables appear correctly, SourcesTable/DigestsTable never [-]/[+]
```

## Key files

- `apps/infra/lambdas/generate-digest/handler.ts` — `generateMeta()`, model
  selection, multi-source content assembly
- `packages/catalog/src/page/DigestMeta.schema.ts` — schema changes
- `apps/infra/lib/dynamo.ts` — new `TagsTable` helpers, Digests `embedding`
  field
- `apps/infra/lib/similarity.ts` — reused for Digests semantic search
- `apps/infra/lib/bookmark-digest-stack.ts` — `TagsTable`, `GET /tags`,
  `GET /digests/search` routes
- `apps/web/src/app/browse/BrowsePage.tsx` — tag filter, semantic toggle
