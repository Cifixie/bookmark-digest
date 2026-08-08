import { z } from "zod";

// ---------------------------------------------------------------------------
// Digest metadata enums
// ---------------------------------------------------------------------------

/** Tone of the digest (how the AI frames the explanation). */
export const tone = z.enum([
  "conversational",
  "technical",
  "beginner-friendly",
  "executive-summary",
  "deep-dive",
]);
export type Tone = z.infer<typeof tone>;

/** Approximate reading length of the digest. */
export const length = z.enum(["short", "medium", "long", "comprehensive"]);
export type Length = z.infer<typeof length>;

/** Target reader difficulty level. */
export const difficulty = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert",
]);
export type Difficulty = z.infer<typeof difficulty>;

/** Category of digest content. */
export const digestType = z.enum([
  "article",
  "video",
  "podcast",
  "tutorial",
  "news",
  "review",
]);
export type DigestType = z.infer<typeof digestType>;

// ---------------------------------------------------------------------------
// Source health enums (informational status of the original link)
// ---------------------------------------------------------------------------

/** Whether the original source link is still accessible and its state. */
export const sourceHealthStatus = z.enum([
  "ok",
  "moved",
  "paywalled",
  "404",
  "inaccessible",
]);
export type SourceHealthStatus = z.infer<typeof sourceHealthStatus>;
