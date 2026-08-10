# Embedding Error Handling Plan

**Context:** `plans/dynamodb-migration.md` §3 (DynamoDB Stream → embed-source trigger). The `embed-source` Lambda (DynamoDB Stream-triggered, `apps/infra/lambdas/embed-source/handler.ts`) is the single failure point in the ingestion pipeline. When it fails, the source is left stuck in `status: "embedding"` — no error stored, no transition to `failed`, no retry, no visibility.

**Root causes of failure:**
- **Malformed Bedrock request** — sending model-unsupported params (e.g. `dimensions`/`normalize` on Titan v2) → `ValidationException`
- **Bedrock throttling** (`ThrottlingException`) — rate-limited model invocations
- **Bedrock service errors** (`ServiceUnavailableException`, `InternalServerException`)
- **Invalid input** — content exceeds Bedrock's input token/text limits (Titan v2: 8,192 tokens), or is empty/whitespace
- **IAM permission errors** — Bedrock `bedrock:InvokeModel` not granted
- **Stream ordering issues** — late stream record arrives after a manual status change
- **Bedrock returned no embedding** — API response anomaly (currently thrown as a hard error)

**Goal:** make embedding failures **visible, recoverable, and contained** without changing the core architecture (DynamoDB Streams + Lambda + Bedrock).

---

## 1. Status transitions

The `Sources.status` attribute needs a proper failure path:

```
fetched → embedding → ready
              ↓
            failed
```

Current behavior: on any error, `embed-source` just increments `errors` counter and moves to the next record. The source remains in `"embedding"` forever.

**Required change:** on any unhandled error in `embed-source`, transition the source to `status: "failed"` and store the error reason:

```ts
await sourcesUpdate(contentHash, "SET #s = :status, #e = :err", {
  ":status": "failed",
  ":err": truncateError(err, 1000), // see §2
  "#s": "status",
  "#e": "error",
});
```

For the "empty content" case (already handled in the current code), keep the existing `failed` transition but also add a proper `error` message (currently it stores `"No content to embed"` without the `error` attribute being set correctly — the expression uses `#e` but the error text is passed without the proper binding).

---

## 2. Error message sanitization

**Never store raw Error objects in DynamoDB.** The current code does `console.error(..., err)` which produces a cross-platform serializable object (good for logs) but needs explicit `err.message` truncation when storing in DynamoDB (DynamoDB String has a 400 KB limit; error messages from Bedrock SDK can be longer due to stacked error JSON).

Add a small utility:

```ts
function truncateError(err: unknown, max = 1000): string {
  if (err instanceof Error) return err.message.slice(0, max);
  if (typeof err === "string") return err.slice(0, max);
  try {
    return JSON.stringify(err).slice(0, max);
  } catch {
    return String(err).slice(0, max);
  }
}
```

Store via the `#e` / `error` attribute set in the expression.

---

## 3. Retry with exponential backoff (per-item, within Lambda)

Bedrock throttling and transient `ServiceUnavailableException` are **retryable**. The most common failure mode — implement **in-Lambda retries** with exponential backoff before declaring failure.

- **Retryable errors:** `ThrottlingException`, `ServiceUnavailableException`, `InternalServerException`
- **Non-retryable errors:** `ValidationException` (bad input — no retry helps), `AccessDeniedException` (IAM misconfiguration — retry wastes time), `ConditionalCheckFailedException` (status race — retry wastes time)

```ts
import { ThrottlingException, ServiceUnavailableException, InternalServerException } from "@aws-sdk/client-bedrock-runtime";

const RETRYABLE = new Set([
  "ThrottlingException",
  "ServiceUnavailableException",
  "InternalServerException",
]);

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

async function embedWithRetry(text: string, attempt = 0): Promise<number[]> {
  try {
    return await embedText(text);
  } catch (err: any) {
    if (RETRYABLE.has(err.name ?? err.code) && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`Bedrock ${err.name} for ${text.slice(0, 50)}... retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, backoff));
      return embedWithRetry(text, attempt + 1);
    }
    throw err; // non-retryable or exhausted retries
  }
}
```

This handles the **most common production failure mode** — Bedrock rate limiting under burst ingestion — without needing a Step Function or DLQ.

---

## 4. Stream event dedup / status race

A DynamoDB Stream event may arrive **after** the source status has already been changed (e.g., `ingest-url` marks it `"embedding"`, then a background process or manual intervention marks it `"failed"`, then the stream INSERT event fires).

**Guard:** before attempting embedding, check that the current status is `"embedding"`. If it's `"ready"` or `"failed"`, skip silently:

```ts
if (record.dynamodb.NewImage?.status?.S !== "embedding") {
  console.debug(`Skipping ${contentHash}: status is ${record.dynamodb.NewImage?.status?.S}, not "embedding"`);
  return; // no error counted — not a failure
}
```

This prevents overwriting `"ready"` with a stale stream embedding and prevents re-embedding a failed item.

---

## 5. Dead Letter Queue (DLQ) via Lambda async config

For errors that survive retries (§3) and are non-recoverable at the item level, route the **entire batch** to a DLQ for later analysis. This is for Lambda-level failures (out-of-memory, cold-start crashes, SDK crash, etc.) where the item can't be processed at all.

### CDK change

```ts
import * as sqs from "aws-cdk-lib/aws-sqs";

const embedDlq = new sqs.Queue(this, "EmbedDlq", {
  retentionPeriod: cdk.Duration.days(14),
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

embedSourceFn.addEventSource(new lambdaEventSources.DynamoEventSource(sourcesTable, {
  startingPosition: lambda.StartingPosition.LATEST,
  maximumRetryAttempts: 0, // Lambda won't auto-retry batches
  maximumBatchingWindow: cdk.Duration.seconds(5),
  filters: [lambda.FilterCriteria.filter({
    eventName: lambda.FilterRule.isEqual("INSERT"),
  })],
  DLQ: dlq, // ← enables the DLQ
}));
```

With `maximumRetryAttempts: 0`, the DynamoDB stream event source won't retry the whole batch on Lambda failure — instead it sends to DLQ immediately, preventing indefinite retry loops on bad data.

**Access pattern:** periodically `ReceiveMessage` from the DLQ queue, log item hashes to a CloudWatch metric or email alert. Use `FilterRule.isEqual("INSERT")` on the stream to ensure only INSERT events reach the DLQ (MODIFY events are filtered out at the stream level, so the DLQ will only contain source items that couldn't be embedded).

---

## 6. Alerting on persistent failure

At personal scale, manual DLQ checking is fine. But if the DLQ starts growing, we need visibility.

**Option A (simple):** Add a daily scheduled Lambda (or EventBridge rule → Lambda) that:
- Queries `Sources` for `status = "failed"` older than 1 hour
- If count > 0, sends a high-priority CloudWatch Alarm or SNS notification

**Option B (CDK built-in):** Use **DynamoDB Stream fan-out** with a separate "monitoring" Lambda that reads the stream alongside `embed-source` and tracks status transitions. When a stream event shows a status that's `"failed"`, it increments a CloudWatch metric. A CloudWatch Alarm on that metric triggers SNS.

**Recommend:** start with Option A — a simple 10-line daily Lambda that checks `status = "failed"` age and sends an SNS notification. Hook up the SNS topic to your team's email or Slack (via Lambda webhook). Add Option B only if you need real-time alerting.

---

## 7. `related-sources` already handles missing embeddings

The `related-sources` Lambda already returns `{ items: [] }` when a source has no embedding — no change needed. For batch scanning (brute-force cosine similarity), the `rankBySimilarity` function already filters out items where `embedding` is not a non-empty array. Sources stuck in `"embedding"` status will be excluded by the `status = ready` filter in the scan.

**Change needed:** the scan filter should explicitly exclude `"failed"` items (to avoid potential stale embeddings). The current filter is `"#s = :ready"` which already does this, so no change is needed.

---

## 8. `ingest-url` should handle `status: "embedding"`

Current `ingest-url` behavior: if an existing item has `status = "embedding"` (not `"ready"`), it proceeds to fetch and create a duplicate entry. This is a bug — if a source is already being embedded, we should return the existing hash without re-fetching.

**Fix:** treat `status = "embedding"` the same as `status = "ready"` in the dedup branch:

```ts
if (existingItems && existingItems.length > 0) {
  const existing = existingItems[0] as { contentHash: string; status: string };
  if (existing.status === "ready" || existing.status === "embedding") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sourceHash: existing.contentHash, status: "existing" }) };
  }
}
```

For `status = "failed"` — **re-fetch and re-embed** is the correct behavior (the user called `ingest-url` again, so they want this URL processed).

---

## 9. Summary of changes

| # | Change | File(s) | Risk |
|---|--------|---------|------|
| 1 | Set `error` attribute on `status: failed` transition | `embed-source/handler.ts` | Low |
| 2 | Add `truncateError` utility | `embed-source/handler.ts` | Low |
| 3 | Add retry with exponential backoff for retryable errors | `embed-source/handler.ts` | Low |
| 4 | Add status guard (skip if not `"embedding"`) | `embed-source/handler.ts` | Low |
| 5 | Add DLQ SQS queue + wire to stream event source | `bookmark-digest-stack.ts` | Low |
| 6 | Daily failed-sources checker Lambda + SNS alert | new `check-embed-failures` Lambda | Low |
| 7 | (No change needed) `related-sources` handles missing embeddings | — | — |
| 8 | Dedup `status: "embedding"` → return existing hash | `ingest-url/handler.ts` | Medium (behavior change) |

---

## 10. Implementation order

0. **Fix Bedrock request body** — Titan v2 only accepts `{ inputText }`; v2 does NOT support `dimensions` or `normalize` params (a previous model ID update was reverted). The `buildEmbedBody()` function now routes v2 → `{ inputText }` only, keeping other models extensible.
1. **#1 + #2 + #3 + #4** — Fix `embed-source` handler (status transition, error storage, retry, guard). Self-contained, no infra change.
2. **#5** — Add DLQ to CDK and deploy infra.
3. **#6** — Add daily checker Lambda + SNS alert topic.
4. **#8** — Fix `ingest-url` dedup for `"embedding"` status.

Steps 1–2 can be deployed independently. Step 3 adds visibility. Step 4 closes a dedup edge case.
