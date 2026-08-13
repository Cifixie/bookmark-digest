# Parked ideas

Real ideas, not currently worth a queue slot in `plans/ROADMAP.md`. Each has
a stated reason it's parked rather than deferred-with-a-trigger (that's what
`plans/multi-catalog-gating.md` is, kept as its own file since it has an
explicit trigger condition). Revisit any of these if the stated reason
stops applying.

## Progressive digest streaming

`@json-render/core`'s wire format is RFC-6902 JSON Patch lines that
progressively build a `Spec` — `@json-render/react` ships `useUIStream` to
consume that live, rendering blocks as they arrive instead of the current
`POST /digests` → spinner → poll-until-done UX.

**Why parked:**
- Infra shape doesn't support it — `apps/infra/lib/bookmark-digest-stack.ts`
  uses `apigw.RestApi`, which buffers the full Lambda response. Real
  streaming needs a Lambda Function URL (`InvokeMode.RESPONSE_STREAM`) or a
  WebSocket API alongside the existing REST API — not a small tweak.
- Tension with a correctness fix already in place: the current pipeline
  validates the fully compiled Spec (structural + per-type props) before
  ever accepting it, retrying on invalid output. Streaming patches straight
  to the browser would let a bad block flash on screen before a retry
  replaces it — reintroducing, for the live view, the exact failure mode
  (wrong content reaching the user) [[decisions]]'s Spec-validation note
  exists to prevent.
- Not measured as a real problem — digest generation's actual p50/p95
  latency hasn't been measured post-migration. Measure before investing.

**If picked up:** decide whether to hold progressive renders behind a
"provisional" state until final validation passes; Function URL vs.
WebSocket tradeoffs (auth, CORS, cost, CDK complexity); whether
`useUIStream` can point at a Function URL directly or needs an adapter.

## S3 Glacier lifecycle for raw source content

Rough shape, never fully scoped: push raw fetched content to S3, run the
actual digest workflow off derived/processed data, keep the raw format
around for re-evaluation, then lifecycle it to Glacier Instant Retrieval (or
delete) after some interval since it's rarely needed after the first burst.

**Why parked:** no current cost or storage pressure to act on — raw content
today lives inline in the `Sources` DynamoDB item, and at personal-bookmark
scale that's not a problem yet. This would also be a real architecture
change (content moves out of DynamoDB into S3, `Sources` items become
pointers) — not scoped enough to queue, and not motivated by any current
pain.

**If picked up:** needs actual scoping — what triggers the move to S3 in
the first place (this isn't just a lifecycle policy on data that's already
there), what reads raw content today and how those reads change, whether
"rarely needed after first burst" is even true for this project's actual
access pattern (unverified assumption).

## Image/OCR ingestion

A fourth ingestion path alongside URL fetch, manual paste, and file upload
(`plans/source-quality-and-upload.md`) — screenshots or photographed pages
with no extractable text layer.

**Why parked:** explicitly out of scope when file-upload-ingestion was
designed — no link targets to preserve (the main motivation for HTML/PDF
upload), and it needs a vision/OCR pass instead of text extraction, which is
a different feature with its own design questions (which OCR service,
accuracy expectations, cost per image) rather than an extension of the
HTML/PDF work.

**If picked up:** scope as its own plan, not a bullet added to
`source-quality-and-upload.md` — different extraction technology, different
failure modes.
