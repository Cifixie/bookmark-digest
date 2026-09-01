/**
 * Brute-force cosine similarity over the Sources table — the pgvector
 * replacement described in plans/dynamodb-migration.md §2. Fine at
 * personal-bookmark scale (dozens to low thousands of items); revisit with a
 * real vector index (OpenSearch Serverless, etc.) only if that stops holding.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredSource {
  contentHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  title: string | null;
  score: number;
}

/**
 * Ranks candidate sources by cosine similarity to `queryEmbedding`, excluding
 * `excludeContentHash` (typically the source the query embedding came from),
 * and returns the top `count` matches. `title` is optional on the candidate
 * (related-sources doesn't project it) — falls back to null.
 */
export function rankBySimilarity(
  candidates: Array<{ contentHash: string; url: string; contentType: string; fetchedAt: string; title?: string | null; embedding?: number[] }>,
  queryEmbedding: number[],
  excludeContentHash: string,
  count: number
): ScoredSource[] {
  return candidates
    .filter((c) => c.contentHash !== excludeContentHash && Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      contentHash: c.contentHash,
      url: c.url,
      contentType: c.contentType,
      fetchedAt: c.fetchedAt,
      title: c.title ?? null,
      score: cosineSimilarity(queryEmbedding, c.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Source mode inference
// ---------------------------------------------------------------------------

/**
 * Infers the appropriate sourceMode (compare | evolution | synthesize) from
 * a set of scored candidate sources using their fetched dates.
 *
 * Heuristic: if all sources are within COMPARE_WINDOW of each other (tight
 * temporal clustering), infer "compare" (they cover the same moment in time).
 * If the spread is wider, infer "evolution" (they trace a topic over time).
 * Otherwise default to "synthesize" (complementary sources without a strong
 * temporal pattern).
 */
export const COMPARE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function inferSourceMode(
  fetchedAts: string[],
): "compare" | "evolution" | "synthesize" {
  if (fetchedAts.length < 2) return "synthesize";

  const dates = fetchedAts.map((d) => new Date(d).getTime()).filter(Boolean);
  if (dates.length < 2) return "synthesize";

  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const spread = max - min;

  if (spread <= COMPARE_WINDOW_MS) return "compare";
  if (spread > 365 * 24 * 60 * 60 * 1000) return "evolution"; // >1 year

  return "synthesize";
}
