# Emergence feed v1

**Fork:** A. This is the first thing a user actually *sees* that is Sediment
rather than bookmark-digest.
**Queue position:** fifth — after `plans/substrate-tagging-and-dedup.md`, no
exceptions (accumulation before AI).
**Status:** not started.

## The idea

Fork A's premise is that the act of saving is the signal, and the interesting
output is what emerges from accumulation — tension, clustering, relational
connection — not a digest of any one item. The emergence feed is where that
output lives.

A row in the feed is not "here's the article you saved." It's a **relational
observation**: this connects to four things you saved; this contradicts
something from March; you've now saved three things about this in two weeks.

## What v1 is, and what it deliberately is not

**Is:** TL;DR (from `plans/extraction-and-tldr.md`) plus relational reactions,
built on retrieval that already exists — brute-force cosine
(`lib/similarity.ts`) and the tag/cluster substrate.

**Is not:** new clustering infrastructure, a tension-detection model, or an
LLM call per feed render. v1 should be assembleable from a projected Sources
scan and cosine similarity. If a feed row needs a model call to exist, it's
v2 work.

## Reactions must be relational, never evaluative

**Rejected, explicitly:** save-time "this looks interesting" popups. The
signal came from the user's own save; echoing it back is noise. A system that
tells you it finds your bookmark interesting has told you nothing you didn't
know when you saved it.

Save-time and feed-time reactions have to be *relational* to be worth
surfacing:

- "connects to 4 things you saved"
- "contradicts something you saved in March"
- "third thing on this topic in two weeks"
- "you saved this same claim from a different source"

`inferSourceMode` (shipped, from `plans/suggested-bundles.md`) is already a
narrow Fork-B-scoped version of exactly this instinct: it looks at how a set
of sources relate to each other and names the relationship
(`synthesize` / `compare` / `evolution`). **Generalize that heuristic into
Fork A rather than writing a fresh one** — it's the same judgment, and it has
already been dogfooded.

Note the constraint it carries with it: `sourceMode` is deliberately *not*
inferred for generation, because asserting a relationship that isn't there
produces wrong output (`wiki/decisions.md`). In Fork A the stakes are lower —
a wrong "contradicts" is a bad feed row, not a bad digest — but the lesson
holds: a relational claim needs evidence, and "these two embeddings are near
each other" is evidence of topical proximity, not of contradiction. v1 should
claim only what cosine similarity plus tags can actually support:
"connects to", "same topic again", "same cluster". **"Contradicts" needs
`Statistics` disagreement or a real tension pass and should wait** — it is
the most compelling row type and the easiest to be embarrassingly wrong
about.

## Data path

Everything needed exists after the earlier queue items:

- TL;DR — denormalized onto the Sources item precisely so a feed render is
  one projected scan.
- `clusterId`, tags — from the substrate plan.
- Relatedness — `lib/similarity.ts`, the same path
  `GET /sources/{sourceHash}/related` already serves.

**Projection discipline:** `lib/dynamo.ts`'s scan helper carries an explicit
warning to always pass `projectionExpression`, because a source item holds
full `content` plus a multi-hundred-float `embedding` and an unprojected page
returns a handful of rows. A feed is the highest-volume read in the product;
getting this wrong makes it feel broken rather than slow. (The S3 migration
moves `content` out, which helps — `embedding` still doesn't belong in a feed
projection.)

## Surface

`apps/web` — a new route, and the first genuinely Fork-A UI. Note the
handoff's premise that this should carry a Next.js→Vite migration with it is
wrong: `apps/web` is already a Vite SPA (`react-router-dom`,
`src/app/router.tsx`, no `next` dependency). Add a route to the existing
router. See `docs/two-fork-architecture.md`.

Cosmetic leftover worth knowing: `src/app/` uses Next-style `page.tsx`
filenames and folder-per-route layout. That's a naming convention, not a
framework. Match it or don't, but don't read it as evidence of Next.

**New endpoint reminders** — the feed needs one, and per `wiki/gotchas.md`:
an explicit `.addResource().addMethod()` is required (a Lambda plus IAM
grants silently 404s, or worse, matches a sibling path parameter), and the
`Authorization` header takes a **bare idToken**, no `Bearer ` prefix — the
prefix produces a 401 with no CloudWatch log line at all.

## v2 and beyond, not in scope here

Tension detection, topic clustering as its own pass, chat-with-corpus over
the compact TL;DR index, inbound discovery. All of it sits behind this
shipping and being dogfooded first.

## Local-model fit

Good: the feed row components, the generalized relational heuristic as a pure
function plus tests, projection helpers. Keep on Claude/Pi: the new API
Gateway route and its IAM, and the decision about which reaction types v1 is
allowed to assert.
