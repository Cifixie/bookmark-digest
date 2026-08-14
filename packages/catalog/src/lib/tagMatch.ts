/**
 * Tag vocabulary helpers — normalization, fuzzy matching, and Levenshtein distance.
 *
 * Pure functions with no AWS dependencies — designed for easy unit testing.
 */

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 * O(m × n) time and space.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Tag normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a tag for comparison:
 *   lowercase + trim + strip punctuation → single-space-joined
 *
 * "CSS" → "css"
 * "Design Systems" → "design systems"
 * "IaC" → "iac"
 */
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // strip punctuation
    .replace(/\s+/g, " "); // collapse whitespace
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

export interface TagMatchResult {
  /** The canonical (existing vocabulary) tag that matched, or `newTag` if no match. */
  canonical: string;
  /** Whether the match was exact (normalized keys matched) or fuzzy. */
  fuzzy: boolean;
}

/**
 * Match a new tag against existing vocabulary.
 *
 * Two-layer approach:
 * 1. **Normalization** — deterministic, no threshold. Collapses casing/punctuation/
 *    whitespace variants into one key.
 * 2. **Fuzzy match** — Levenshtein ≤ 2, only if normalized key isn't an exact hit.
 *    Skips fuzzy matching for tags under ~4 characters to avoid false merges
 *    (e.g., "AI" / "UI" style).
 *
 * Returns the canonical tag to use (stability over "most recent casing").
 */
export function matchTag(
  newTag: string,
  existingTags: { displayTag: string }[],
): TagMatchResult {
  const normalized = normalizeTag(newTag);
  const short = normalized.length < 4;

  // Layer 1: Exact normalized match
  for (const tag of existingTags) {
    if (normalizeTag(tag.displayTag) === normalized) {
      return { canonical: tag.displayTag, fuzzy: false };
    }
  }

  // Layer 2: Fuzzy match (skip for short tags to avoid false merges)
  if (!short) {
    for (const tag of existingTags) {
      const otherNorm = normalizeTag(tag.displayTag);
      if (levenshtein(normalized, otherNorm) <= 2) {
        return { canonical: tag.displayTag, fuzzy: true };
      }
    }
  }

  // No match — new tag gets its own entry
  return { canonical: newTag, fuzzy: false };
}
