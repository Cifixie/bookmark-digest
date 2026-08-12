# Digest synopsis (semantic search on digests) + model tiering

**Status:** proposed — not started.

**Goal:** two related upgrades to the existing `generateMeta` step in
`generate-digest/handler.ts`, decided together because they touch the same
call: (1) give digests a semantic-search story by generating a short
purpose-built synopsis to embed, and (2) stop spending Gemini's scarce quota
on that call at all by moving it to Bedrock Claude Haiku.

## Why this exists

Semantic search exists for Sources (`search-sources` Lambda, ranks by cosine
similarity over the `embedding` field `embed-source` writes on ingest) but not
for Digests — Digests carry no embedding today, and there's nothing natural
to embed: the stored `output` is a compiled Spec tree (rendering data —
element keys, block types, nested props), not prose. Reconstructing readable
text from that tree just to embed it would be lossy and fragile.

Separately: `generateMeta()` already exists as a small second model call
(subject/tags/digestType/tone/length/difficulty), deliberately split from the
heavy Spec-generation call so a failure there doesn't invalidate a good
digest (see the comment in `generate-digest/handler.ts`). It currently:
- runs on Gemini (`GENERATION_MODEL`), same as the main call, so it competes
  for the same 20-requests/day free-tier quota that the code already treats
  as the binding constraint (see `isQuotaExceeded`'s Bedrock-fallback path);
- only runs for single-source digests, because "what category is this" is
  genuinely ambiguous across N sources.

Both gaps get fixed by the same change: add a `synopsis` field to
`digestMetaSchema` and generate it in the same call as the rest of `meta` (not
a third call — see the "why not an agent / why not one merged call with Spec
generation" discussion below), then route that whole call to Haiku instead of
Gemini.

## Decision: still 2 calls per digest, not 1 and not 3

Considered and rejected: folding `meta`+`synopsis` into the *same* call as
Spec generation (a single "umbrella" call). Rejected because it would couple
failure modes — a malformed trailing JSON blob for meta could risk tripping
up parsing of the Spec JSONL stream, which currently fails independently and
safely. It would also mean the classification/synopsis task competes for the
model's attention against the much harder structural-generation task in the
same context window, likely at the cost of quality on both.

Considered and rejected: an agentic/tool-calling loop that "decides" the
workflow (fetch → generate → validate → classify → save). Rejected because
none of those steps are actually uncertain — the sequence is always the same,
and the repair logic (`autoFixSpec`, null-stripping, dangling-ref pruning) is
exactly the kind of thing that should stay deterministic code, not something
an LLM re-decides per run. An agent framework would add indirection and token
cost for a workflow with no real branching to reason about.

So: keep the existing 2-call shape (Spec generation, then meta) — just widen
what the second call covers, and change which model runs it.

## Change 1: synopsis for embedding

- Add `synopsis: z.string().max(500)` (rough cap, tune later) to
  `packages/catalog/src/page/DigestMeta.schema.ts`'s `digestMetaSchema` —
  "a couple of sentences describing what this digest covers," written for a
  human scanning search results, not for the model's own use.
- Add `synopsis` to `generateMeta`'s prompt in `generate-digest/handler.ts`
  alongside the existing fields — one more field in an already-structured
  JSON ask, not a new call.
- **Unlike `subject`/`tags`, generate `synopsis` for multi-source digests
  too.** "What does this digest cover" has a coherent answer across N
  sources the way "what single category is this" doesn't — this closes the
  existing single-source-only gap for at least this one field. Whether
  `subject`/`tags` should also be attempted for multi-source is a separate,
  not-yet-decided question; don't conflate the two just because they're
  generated in the same call.
- After a validated `meta.synopsis` comes back, embed it (reuse the same
  Titan embedding path `embed-source`/`search-sources` already use — no new
  embedding integration needed) and store the vector on the Digests table
  item (`embedding` field, mirroring Sources' shape).
- New `GET /digests/search?q=` Lambda + route, mirroring `search-sources`
  almost exactly (embed the query, scan Digests for items with an
  `embedding`, rank by cosine similarity via the existing
  `lib/similarity.ts` — `rankBySimilarity` already accepts arbitrary
  candidate shapes). **Remember the Phase-3 gotcha** (`wiki/gotchas.md`):
  building the Lambda and granting IAM is not the same as the route existing
  — confirm with `cdk diff` that the new `AWS::ApiGateway::Method` actually
  appears before calling this done.
- Browse UI: same "✦ Semantic" toggle pattern `BrowsePage.tsx` already has
  for Sources, added to the Digests tab.

## Change 2: move the meta/synopsis call to Bedrock Claude Haiku

- `generate-digest/handler.ts` already has everything this needs: the
  `bedrock` provider (`createAmazonBedrock({})`), the Haiku inference-profile
  ID (`BEDROCK_HAIKU_INFERENCE_PROFILE_ID`/`FALLBACK_MODEL`), and the IAM
  policy granting `bedrock:InvokeModel` on both the inference-profile ARN and
  the underlying foundation-model ARN — all provisioned already because
  Haiku is the existing fallback for when Gemini's quota is exhausted on the
  *main* call.
- Change `generateMeta()` to call `bedrock(FALLBACK_MODEL)` unconditionally
  instead of `provider(GENERATION_MODEL)` (Gemini). No quota-exceeded
  fallback logic needed for this call specifically — it's not falling back
  to Haiku, it's *always* Haiku.
- Net effect: the meta/synopsis call no longer touches Gemini's 20/day quota
  at all. The only Gemini call per digest is the one that actually needs its
  context window and quality — Spec generation.
- Side benefit: since quota is no longer the pressure on this call, there's
  no efficiency reason to keep meta/tags/synopsis merged into one call if a
  future change wants to split them for clarity — that tradeoff only existed
  because of Gemini's quota scarcity, which this change removes for this
  call. Not proposing a split now, just noting the constraint that justified
  "one call" is gone.
- Cost note: unlike Gemini's free tier, Haiku invocation has a real
  (small) per-token AWS cost. At personal-bookmark scale and Haiku's price
  point for a ~500-output-token classification call, this is expected to be
  negligible, but worth a glance at actual Bedrock billing after a week of
  use rather than assuming.

## Interaction with `plans/tag-vocabulary-fuzzy-matching.md`

That plan also extends the same `generateMeta` call (injecting existing tag
vocabulary into the prompt, fuzzy-matching the returned tags). Build them
together or sequence deliberately — both are editing the same prompt and the
same call site in `generate-digest/handler.ts`, and doing them independently
risks one PR clobbering the other's prompt changes. Suggested order: model
tiering first (mechanical, low-risk, no schema changes), then synopsis
(schema + embedding + search endpoint), then tag vocabulary (schema-adjacent,
needs its own table) — each independently valuable and independently
deployable, but touching them in that order minimizes rework.

## Rough estimate

1. Move `generateMeta` to Haiku — 15-20 min (config change + a sanity-check
   generation to confirm Haiku's output still parses/validates against
   `digestMetaSchema` the same way Gemini's does).
2. `synopsis` field: schema change + prompt update + multi-source support in
   the `sourceHashes.length === 1` gate (now needs a multi-source content
   summary path, similar to how the main Spec-generation call already
   assembles multi-source prompts) — 45-60 min.
3. Embed + store on Digests table (`dynamo.ts` update, digest item gets an
   `embedding` field) — 20-30 min.
4. `GET /digests/search` Lambda + CDK route + `cdk diff` verification —
   30-45 min.
5. Browse UI: semantic toggle on Digests tab — 20-30 min.
6. Manual verification: generate a few digests (including a multi-source
   one), confirm synopsis quality, confirm semantic search actually surfaces
   relevant digests — 30-45 min.

**Total: ~3-4 hours.**

## Open questions

- `synopsis` max length is a guess (500 chars) — tune once real output
  exists; too short loses the point of "searchable," too long drifts back
  toward "just embed everything."
- Whether multi-source `synopsis` generation needs its own truncation
  strategy for source content (the main call already has
  `MAX_SOURCE_CHARS_MULTI` for exactly this problem) or can get away with a
  much smaller per-source slice than the main call needs, since it's only
  producing a couple of sentences, not full content.
- Confirm Haiku's JSON-extraction behavior matches Gemini's closely enough
  that the existing `result.text.match(/\{[\s\S]*\}/)` parsing still works
  without changes — worth an early smoke test before building the rest on
  top of it.
