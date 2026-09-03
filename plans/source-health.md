# SourceHealth v1

**Fork:** A (built on shared-substrate detection code).
**Queue position:** third, after the S3 layer and the extraction bridge.
**Status:** not started, but ~40% of it is already shipped as
`detectThinFetch()`.
**Supersedes:** the forward half of `plans/source-quality-and-upload.md`.
That plan's Part A is done and stays as the historical record of how
thin-fetch detection was built and why; this plan is where its unbuilt parts
continue.

## The premise

A save is only as good as the content behind it, and content decays after
ingestion: links rot, articles move behind paywalls, videos get pulled. Fork
A is an accumulation product — it is specifically the thing that suffers when
half the pile silently turned into 404s two months ago.

`detectThinFetch()` (`apps/infra/lib/thin-fetch.ts`) already answers this
question **once, at ingestion**. SourceHealth generalizes it into an ongoing
property of a Source. Absorb and extend it; do not rebuild it.

Governing rule, inherited from the DeepPaperNote evaluation
(`plans/prior-art.md`): **stop and ask for better material rather than fake
completeness.** SourceHealth's job is to make "ask for better material" a
real, actionable path rather than a dead end.

## What exists today

- `detectThinFetch(content): ThinFetchFinding | null` — pure, first ~1,000
  chars only, curly-apostrophe normalized. `That's an error` alone, or 2+ of
  `Skip navigation` / `Show transcript` / `Sign in`. Covered by
  `thin-fetch.test.ts`.
- Wired into `runGeneration` after the `missing.length` check and **before**
  `status: "generating"` — the last point before quota is spent. Marks the
  source `status: "thin"` so ingest dedup treats it as re-fetchable, and fails
  the digest with an error naming the specific source.
- `thin` is in the `sourceStatus` enum
  (`fetched | embedding | ready | thin | failed`) and in the Browse filter +
  badges.
- Manual paste is shipped: `POST /sources` accepts `content` directly,
  `fetchedBy: "manual"`.
- Trigger metrics are logged, seeding the labelled corpus that the deferred
  statistical layer needs.

## What v1 adds

### 1. Health as a field, not a status

`status: "thin"` overloads the ingestion state machine
(`submitted → received → processing → done/failed`) with a content-quality
judgment. That was the right cheap move for one check; it doesn't extend to
four.

Add a `health` object on the Sources item, and leave `status` alone:

```
health: {
  state: "ok" | "thin" | "paywalled" | "gone" | "unchecked",
  checkedAt: string,
  findings: { kind, detail }[],
  override: "manual-paste" | "upload" | "cookie" | null,
}
```

Keep `status: "thin"` writing in parallel for one release so the Browse
filter and the dedup re-fetch path don't break, then migrate both to read
`health.state`. Same alongside-then-cut discipline as the S3 layer.

**Trap:** per `wiki/gotchas.md`, `sourcesUpdate`'s placeholder object splits
into names/values purely by the `#` prefix. `#health = :health` needs
*both* `"#health": "health"` and `":health": {...}` in the same object, or
you get a `ValidationException` at call time — not a type error. This bit
`DigestMeta` once already. Add the pair together in the same `if` block.

### 2. Periodic recheck

Link rot and paywalls emerge *after* ingestion, so a one-time check is
structurally insufficient. Add a scheduled recheck: an EventBridge rule
firing a Lambda that walks Sources oldest-`health.checkedAt`-first, re-fetches
a bounded batch, and runs the detectors.

Design notes:
- **Bounded per run**, not "scan everything" — this is a background hygiene
  task competing with nothing, so a small batch on a daily schedule reaches
  full coverage without a burst of Firecrawl spend.
- **Never overwrite `extracted.md` from a recheck.** The archive in S3 is the
  point (`plans/s3-source-of-truth.md`); a recheck that finds a paywall must
  not replace good stored content with the paywall page. Write recheck
  fetches to a distinct key or rely on bucket versioning, and resolve which
  in implementation — the S3 plan deliberately left this to be decided here.
  Recommendation: distinct `recheck/<timestamp>` key, so `raw.<ext>` means
  exactly "what we got the first time it worked."
- `check-embed-failures` is the closest existing pattern for a scheduled
  maintenance Lambda; match its shape.

### 3. Paywall detection — a flag, not a bypass

Detect and flag. Do **not** build bypass infrastructure. Custom
scrapers/auth-bypass across paywalled sites was evaluated and rejected:
per-site maintenance burden, and it conflicts with the
accumulation-before-AI sequencing that Fork A's whole order depends on. See
`wiki/decisions.md`.

### 4. Override paths

The flag needs a fix, or it's just a red badge:

- **Manual paste** — already shipped, already the approved override. Set
  `health.override = "manual-paste"` and `health.state = "ok"` when it lands.
- **Per-source authenticated cookie** — for the paywall case specifically:
  the user is a subscriber, the content is legitimately theirs, the fetch just
  isn't authenticated. Stored per source, used by re-fetch. Treat the cookie
  as a credential: it does not belong in a DynamoDB attribute in plaintext.
  Scope this carefully or defer it — it is the one piece of v1 with a real
  security surface, and shipping the other three without it is coherent.
- **File upload (HTML/PDF)** — see below.

### 5. Web surface

Browse and the source detail page need to show health and offer the override.
`/sources/:contentHash` already exists and is the natural home: a health
badge, the findings, and a "this fetch is bad — paste or upload the real
content" affordance. Frontend-only; the endpoints exist.

## Open question, resolved: pull file upload forward?

The handoff (§10) asked whether HTML/PDF upload is worth pulling forward now
that it overlaps with SourceHealth's manual override.

**Recommendation: yes, pull it into v1.** Two reasons:

1. **It's the recovery arm of the detection this plan adds.** Shipping
   paywall/rot detection without upload produces flags whose only remedy is
   pasting plaintext — which loses exactly what upload exists to preserve
   (real `href` link targets, and PDFs, which can't be pasted at all).
   Detection without remediation is a worse product than neither.
2. **It was never actually gated.** The handoff §8 lists upload as "gated on
   volume thresholds not yet reached," but that gate belongs to the
   *statistical signal-density layer*, not to upload.
   `plans/source-quality-and-upload.md` confusingly labels both as "Part B",
   which is where the conflation came from. Upload is unblocked and always
   was.

It also gets cheaper in this sequence than it would have standalone:
`POST /sources` already accepts content, and that plan already noted upload
should route through a presigned S3 upload if inline size matters — which is
free once `plans/s3-source-of-truth.md` has landed the bucket and the IAM
shape.

`fetchedBy` becomes `"upload-html"` / `"upload-pdf"` so a bad extraction
stays traceable, matching the existing `manual` convention.

**Still deferred:** the statistical signal-density threshold. Its gate
(~50 sources / ~10 known-bad labelled examples) is real and unmet, and the
recheck loop above is what will actually generate that corpus. Don't fit a
threshold to data you don't have yet.

## Local-model fit

Good: the paywall-marker detector as a pure function plus its vitest cases
(mirror `thin-fetch.test.ts` exactly), the HTML/PDF extraction adapters, and
the health badge components. Keep on Claude/Pi: the EventBridge rule and
Lambda wiring, the `health` field migration, the presigned-upload route (a
*new* API Gateway resource — needs an explicit `.addResource().addMethod()`,
see `wiki/gotchas.md`), and anything touching the cookie override.
