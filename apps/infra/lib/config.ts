/**
 * Centralised config for the bookmark-digest infrastructure.
 *
 * All environment-specific constants live here so lambdas and the CDK stack
 * share a single source of truth — no duplication, no surprise drift.
 */

// ---------------------------------------------------------------------------
// Region
// ---------------------------------------------------------------------------

export const AWS_REGION = process.env.AWS_REGION ?? "eu-north-1";

// ---------------------------------------------------------------------------
// Bedrock model IDs — change one place, everything updates
// ---------------------------------------------------------------------------

export const BEDROCK_EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

export const BEDROCK_EMBEDDING_DIMENSIONS =
  parseInt(process.env.BEDROCK_EMBEDDING_DIMENSIONS ?? "1024", 10);

// ---------------------------------------------------------------------------
// Bedrock ARNs (region defaults to AWS_REGION)
// ---------------------------------------------------------------------------

export function bedrockModelArn(modelId: string): string {
  const region = process.env.AWS_REGION ?? AWS_REGION;
  return `arn:aws:bedrock:${region}::foundation-model/${modelId}`;
}

export const BEDROCK_EMBEDDING_MODEL_ARN = bedrockModelArn(BEDROCK_EMBEDDING_MODEL_ID);

// Claude Haiku only supports invocation via a cross-region inference
// profile, not the bare foundation-model ID (on-demand throughput isn't
// supported for this model). "eu." keeps inference within the EU, matching
// the eu-north-1 default region.
export const BEDROCK_HAIKU_INFERENCE_PROFILE_ID =
  process.env.BEDROCK_HAIKU_INFERENCE_PROFILE_ID ?? "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

// IAM policies for inference-profile invocation must grant both the
// profile ARN (built in the stack, where the account ID is available) and
// this underlying foundation-model ARN — wildcard region, since the
// profile may route to any region in its geography.
export const BEDROCK_HAIKU_FOUNDATION_MODEL_ARN =
  "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0";

// ---------------------------------------------------------------------------
// Gemini (generate-digest) — personal API key, not Bedrock
// ---------------------------------------------------------------------------

export const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID ?? "gemini-3.6-flash";

// Secret is created out-of-band (not by CDK) so the key never enters the
// stack template or cdk.out assets.
export const GEMINI_API_KEY_SECRET_NAME =
  process.env.GEMINI_API_KEY_SECRET_NAME ?? "bookmark-digest/gemini-api-key";

// ---------------------------------------------------------------------------
// Embed source tuning
// ---------------------------------------------------------------------------

// Titan v2 input token limit is 8,192 tokens (~24,000–30,000 chars).
// We cap well below that to avoid tokenization surprises.
export const EMBED_TEXT_TRUNCATE_LIMIT =
  parseInt(process.env.EMBED_TEXT_TRUNCATE_LIMIT ?? "16000", 10);

// ---------------------------------------------------------------------------
// Related sources tuning
// ---------------------------------------------------------------------------

export const RELATED_DEFAULT_COUNT =
  parseInt(process.env.RELATED_DEFAULT_COUNT ?? "3", 10);

export const RELATED_MAX_COUNT =
  parseInt(process.env.RELATED_MAX_COUNT ?? "20", 10);

// ---------------------------------------------------------------------------
// Generate digest tuning
// ---------------------------------------------------------------------------

// Output-length ceiling for the generateText call, not an input/context
// limit — the source content (e.g. a 2-hour transcript) goes in as the
// prompt and is bounded by the model's context window instead. Kept as an
// explicit cap for cost/runaway-output safety, set high enough that a rich
// digest of a long source shouldn't hit it; the worker Lambda's 10-minute
// timeout has plenty of room for it.
export const DIGEST_MAX_TOKENS =
  parseInt(process.env.DIGEST_MAX_TOKENS ?? "32768", 10);

// ---------------------------------------------------------------------------
// Firecrawl
// ---------------------------------------------------------------------------

export const FIRECRAWL_API_URL =
  process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev/v1/scrape";

// ---------------------------------------------------------------------------
// DynamoDB table names — provided by CDK at runtime, empty default for local
// ---------------------------------------------------------------------------

export const SOURCES_TABLE_NAME = process.env.SOURCES_TABLE_NAME ?? "";
export const DIGESTS_TABLE_NAME = process.env.DIGESTS_TABLE_NAME ?? "";

// ---------------------------------------------------------------------------
// Embed failure alerting
// ---------------------------------------------------------------------------

export const ALARM_AGE_MS =
  parseInt(process.env.ALARM_AGE_MS ?? "3600000", 10); // 1 hour

export const EMBED_ALERT_EMAIL =
  process.env.EMBED_ALERT_EMAIL; // email for SNS failure alerts (optional)
