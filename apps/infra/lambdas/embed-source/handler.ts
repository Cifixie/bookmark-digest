/**
 * embed-source Lambda — Phase-1 embedding step (DynamoDB Stream-triggered).
 *
 * Triggered automatically when a new item is inserted into the Sources table
 * (via DynamoDB Stream with filter for INSERT events). No explicit DB query
 * needed — the stream record contains the new image.
 *
 * Error handling: retries retryable Bedrock errors with exponential backoff,
 * transitions sources to "failed" with error text on unrecoverable errors,
 * skips stale stream events (status guard), routes batch-level failures
 * to a DLQ.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { sourcesUpdate } from "../../lib/dynamo";
import {
  BEDROCK_EMBEDDING_MODEL_ID,
  BEDROCK_EMBEDDING_DIMENSIONS,
  EMBED_TEXT_TRUNCATE_LIMIT,
  AWS_REGION,
} from "../../lib/config";

// ---------------------------------------------------------------------------
// Retryable error types from the Bedrock SDK
// ---------------------------------------------------------------------------

const RETRYABLE_CODE_SET = new Set([
  "ThrottlingException",
  "ServiceUnavailableException",
  "InternalServerException",
]);

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncateError(err: unknown, max = 1000): string {
  if (err instanceof Error) return err.message.slice(0, max);
  if (typeof err === "string") return err.slice(0, max);
  try {
    return JSON.stringify(err).slice(0, max);
  } catch {
    return String(err).slice(0, max);
  }
}

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { name?: string })?.name;
  return typeof code === "string" && RETRYABLE_CODE_SET.has(code);
}

// ---------------------------------------------------------------------------
// Bedrock embedding with retry
// ---------------------------------------------------------------------------

const BEDROCK_MODEL = process.env.BEDROCK_EMBEDDING_MODEL ?? BEDROCK_EMBEDDING_MODEL_ID;
const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

/**
 * Build the Bedrock invocation body.
 *
 * Titan Embed v2: { inputText } only — does NOT accept dimensions or normalize.
 * Other models (Cohere, etc.): { inputText, dimensions, normalize } as applicable.
 */
function buildEmbedBody(text: string): Record<string, unknown> {
  const truncated = text.length > EMBED_TEXT_TRUNCATE_LIMIT ? text.slice(0, EMBED_TEXT_TRUNCATE_LIMIT) : text;

  // Titan v2 only accepts inputText — no extra params
  if (BEDROCK_MODEL.includes("titan-embed-text-v2")) {
    return { inputText: truncated };
  }

  // Default for other models
  const body: Record<string, unknown> = { inputText: truncated };
  if (BEDROCK_EMBEDDING_DIMENSIONS > 0) {
    body.dimensions = BEDROCK_EMBEDDING_DIMENSIONS;
  }
  return body;
}

async function embedText(text: string): Promise<number[]> {
  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: BEDROCK_MODEL,
    body: JSON.stringify(buildEmbedBody(text)),
    contentType: "application/json",
    accept: "application/json",
  }));
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  if (!parsed.embedding) throw new Error(`Bedrock returned no embedding: ${JSON.stringify(parsed)}`);
  return parsed.embedding as number[];
}

async function embedWithRetry(text: string, attempt = 0): Promise<number[]> {
  try {
    return await embedText(text);
  } catch (err: unknown) {
    if (isRetryable(err) && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      const preview = text.slice(0, 60).replace(/\s+/g, " ");
      const code = (err as { code?: string })?.code ?? (err as { name?: string })?.name ?? "unknown";
      console.warn(`Bedrock ${code} for "${preview}..." — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, backoff));
      return embedWithRetry(text, attempt + 1);
    }
    throw err; // non-retryable or exhausted retries
  }
}

// --- DynamoDB Stream event handler ---

interface DynamoDBStreamEvent {
  Records: Array<{
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    dynamodb: {
      NewImage: Record<string, { S?: string | null; N?: string | null; L?: any[]; M?: Record<string, any> }>;
    };
  }>;
}

export async function handler(event: DynamoDBStreamEvent): Promise<{ embedded: number; skipped: number; failed: number }> {
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of event.Records) {
    try {
      const newImage = record.dynamodb.NewImage;
      const contentHash = newImage.contentHash?.S;

      // --- Content completeness check ---
      if (!contentHash) {
        console.warn("Stream record missing contentHash, skipping");
        skipped++;
        continue;
      }

      const content = newImage.content?.S;
      if (!content) {
        console.warn(`Stream record for ${contentHash} missing content, skipping`);
        skipped++;
        continue;
      }

      // --- Status guard: skip stale stream events ---
      const currentStatus = newImage.status?.S;
      if (currentStatus !== "embedding") {
        console.debug(`Skipping ${contentHash}: current status is "${currentStatus}", not "embedding"`);
        skipped++;
        continue;
      }

      // --- Empty content → failed (not an error) ---
      if (content.trim().length === 0) {
        await sourcesUpdate(contentHash, "SET #s = :status, #e = :err", {
          ":status": "failed",
          ":err": "No content to embed",
          "#s": "status",
          "#e": "error",
        });
        skipped++;
        continue;
      }

      // --- Embed with retry ---
      const vector = await embedWithRetry(content);
      const now = new Date().toISOString();

      await sourcesUpdate(contentHash, "SET #vec = :vector, #em = :model, #ea = :at, #s = :status", {
        ":vector": vector,
        ":model": BEDROCK_MODEL,
        ":at": now,
        ":status": "ready",
        "#vec": "embedding",
        "#em": "embeddingModel",
        "#ea": "embeddingAt",
        "#s": "status",
      });

      embedded++;
    } catch (err) {
      const contentHash = record.dynamodb.NewImage?.contentHash?.S ?? "unknown";
      const errMsg = truncateError(err);
      console.error(`Embedding failed for ${contentHash}: ${errMsg}`);

      await sourcesUpdate(contentHash, "SET #s = :status, #e = :err", {
        ":status": "failed",
        ":err": errMsg,
        "#s": "status",
        "#e": "error",
      }).catch((updateErr) => {
        console.error(`Failed to mark ${contentHash} as failed:`, truncateError(updateErr));
      });

      failed++;
    }
  }

  console.info(`Embedding complete: ${embedded} succeeded, ${skipped} skipped, ${failed} failed`);
  return { embedded, skipped, failed };
}
