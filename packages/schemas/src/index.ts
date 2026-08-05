import { z } from "zod";

/**
 * Phase-0 core schemas.
 * These back the skeleton pipeline: submit a URL -> track its status -> store raw content.
 * Catalog schemas (defineCatalog, Tier 1/2 digest types) live in @bookmark-digest/catalog,
 * built on top of these once Phase-0's plumbing is validated.
 */

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
