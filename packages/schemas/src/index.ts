import { z } from "zod";

/**
 * Phase-0 core schemas.
 * These back the skeleton pipeline: submit a URL -> track its status -> store raw content.
 * Catalog schemas (defineCatalog, Tier 1/2 digest types) live in @bookmark-digest/catalog,
 * built on top of these once Phase-0's plumbing is validated.
 */

// ---------------------------------------------------------------------------
// Digest Spec shape — used for digest output fields
// ---------------------------------------------------------------------------

/** Zod schema matching json-render's Spec shape (root + keyed elements). */
const specOutputSchema = z.object({
  root: z.string(),
  elements: z.record(z.string(), z.object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(z.string()),
    visible: z.unknown().optional(),
  })),
});

export const jobStatus = z.enum(["received", "processing", "done", "failed"]);
export type JobStatus = z.infer<typeof jobStatus>;

export const bookmarkSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  createdAt: z.iso.datetime(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  bookmarkId: z.uuid(),
  rawContentS3Key: z.string(),
  contentType: z.enum(["article", "video", "unknown"]).default("unknown"),
  createdAt: z.iso.datetime(),
});
export type Document = z.infer<typeof documentSchema>;

export const jobSchema = z.object({
  id: z.uuid(),
  bookmarkId: z.uuid(),
  status: jobStatus,
  error: z.string().nullable().default(null),
  updatedAt: z.iso.datetime(),
});
export type Job = z.infer<typeof jobSchema>;

// API request/response contracts for the Phase-0 ingestion skeleton
export const submitUrlRequestSchema = z.object({
  url: z.url(),
});
export type SubmitUrlRequest = z.infer<typeof submitUrlRequestSchema>;

export const submitUrlResponseSchema = z.object({
  bookmarkId: z.uuid(),
  jobId: z.uuid(),
  status: jobStatus,
});
export type SubmitUrlResponse = z.infer<typeof submitUrlResponseSchema>;

// ---------------------------------------------------------------------------
// Phase-1: Source + Digest schemas (data model for the ingestion pipeline)
// ---------------------------------------------------------------------------

/** Source status: lifecycle of a fetched URL through the pipeline. */
export const sourceStatus = z.enum(["fetched", "embedding", "ready", "failed"]);
export type SourceStatus = z.infer<typeof sourceStatus>;

/** Content type of the fetched source. */
export const sourceContentType = z.enum(["article", "video", "unknown"]);
export type SourceContentType = z.infer<typeof sourceContentType>;

/**
 * Phase-1 source row. Represents a fetched piece of content, keyed by
 * SHA-256 hash of its extracted text. Contains the raw content plus an
 * embedding vector (populated after the embedding step).
 */
export const sourceSchema = z.object({
  contentHash: z.string(),
  url: z.string().url(),
  content: z.string().nullable(),
  contentType: sourceContentType,
  fetchedAt: z.iso.datetime(),
  fetchedBy: z.string().nullable(),
  status: sourceStatus,
  embedding: z.array(z.number()).nullable(),
  embeddingModel: z.string().nullable(),
  embeddingAt: z.iso.datetime().nullable(),
});
export type Source = z.infer<typeof sourceSchema>;

/** Digest status: lifecycle of a generated digest. */
export const digestStatus = z.enum(["pending", "generating", "done", "failed"]);
export type DigestStatus = z.infer<typeof digestStatus>;

/** Digest goal: what the user asked the system to generate. */
export const digestGoalSchema = z.enum(["summary", "tl_dr", "notes", "action_items", "key_points", "understand"]); // Kept for compatibility with DB constraint; prefer DIGEST_GOALS from apps/infra/lib/digest-goals.ts
export type DigestGoal = z.infer<typeof digestGoalSchema>;

/**
 * Phase-1 digest row. Represents a generated digest for a source,
 * containing structured output (json-render Spec) validated against
 * @bookmark-digest/catalog's catalog and per-type props schemas.
 */
export const digestSchema = z.object({
  id: z.string(),
  sourceHash: z.string(),
  digestGoal: digestGoalSchema,
  paramsVersion: z.string(),
  status: digestStatus,
  /** json-render Spec tree (root + keyed elements). */
  output: specOutputSchema.nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Digest = z.infer<typeof digestSchema>;

/** API request: submit a URL for ingestion. */
export const ingestUrlRequestSchema = z.object({
  url: z.string().url(),
});
export type IngestUrlRequest = z.infer<typeof ingestUrlRequestSchema>;

/** API request: request a digest for a source. */
export const requestDigestRequestSchema = z.object({
  sourceHash: z.string(),
  digestGoal: digestGoalSchema,
});
export type RequestDigestRequest = z.infer<typeof requestDigestRequestSchema>;

/** API response: accepted digest request. */
export const requestDigestResponseSchema = z.object({
  digestId: z.string(),
  status: z.literal("accepted"),
});
export type RequestDigestResponse = z.infer<typeof requestDigestResponseSchema>;

/** API response: fetch a digest result. */
export const fetchDigestResponseSchema = z.object({
  id: z.string(),
  digestGoal: z.string(),
  status: digestStatus,
  output: specOutputSchema.nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type FetchDigestResponse = z.infer<typeof fetchDigestResponseSchema>;

/** Single digest goal definition. */
export const digestGoalSchemaApi = z.object({
  goal: z.string(),
  label: z.string(),
  description: z.string(),
});
export type DigestGoalApi = z.infer<typeof digestGoalSchemaApi>;

/**
 * How the sources in a multi-source bundle relate to each other — a separate
 * axis from the digest goal, which covers depth and voice only.
 */
export const sourceModeSchemaApi = z.object({
  mode: z.string(),
  label: z.string(),
  description: z.string(),
});
export type SourceModeApi = z.infer<typeof sourceModeSchemaApi>;

/** API response: list available digest goals (GET /digest-goals). */
export const listDigestGoalsResponseSchema = z.object({
  goals: z.array(digestGoalSchemaApi),
  /** Optional so a client built before source modes existed still parses. */
  sourceModes: z.array(sourceModeSchemaApi).optional(),
  version: z.string().optional(),
});
export type ListDigestGoalsResponse = z.infer<typeof listDigestGoalsResponseSchema>;
