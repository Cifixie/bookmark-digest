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

## S3 Glacier *lifecycle policy* for raw source content

**Split in two by the 2026-09-03 pivot — read this before assuming it's still
one item.** The half that was an architecture change is now queued; only the
cost policy stays parked.

- **Queued (item 1):** moving content out of DynamoDB into S3 and turning
  `Sources` items into pointers. That's `plans/s3-source-of-truth.md`, and
  it's motivated now — not by cost, but by SourceHealth's periodic recheck
  needing a durable archive, the extraction structure needing a stable
  re-computable input, and unprojected `Sources` scans returning a handful of
  rows per page ([[gotchas]]).
- **Still parked (this entry):** the lifecycle rule that transitions those S3
  objects to Glacier Instant Retrieval (or deletes them) after some interval.
  `plans/s3-source-of-truth.md` deliberately ships the bucket with **no**
  lifecycle rules.

**Why still parked:** no cost or storage pressure at personal-bookmark scale,
and the premise is unverified. "Rarely needed after the first burst" is now
actively in doubt — the whole point of the archive is that SourceHealth
rechecks and future re-extraction (better prompt, better parser) read `raw`
long after ingestion. A Glacier transition would put a retrieval delay in
front of exactly those paths.

**If picked up:** measure the real access pattern on the S3 objects first —
that data doesn't exist until item 1 has been running for a while. Then decide
whether `raw` and `extracted.md` want different rules (`extracted.md` is read
constantly, `raw` may genuinely be cold), and account for the bucket's
versioning: noncurrent versions are the cheapest thing to transition and the
obvious place to start.

## Image/OCR ingestion

A fourth ingestion path alongside URL fetch, manual paste, and file upload
(now `plans/source-health.md`, pulled forward into SourceHealth v1) —
screenshots or photographed pages with no extractable text layer.

**Why parked:** explicitly out of scope when file-upload-ingestion was
designed — no link targets to preserve (the main motivation for HTML/PDF
upload), and it needs a vision/OCR pass instead of text extraction, which is
a different feature with its own design questions (which OCR service,
accuracy expectations, cost per image) rather than an extension of the
HTML/PDF work.

**If picked up:** scope as its own plan, not a bullet added to
`source-quality-and-upload.md` — different extraction technology, different
failure modes.
