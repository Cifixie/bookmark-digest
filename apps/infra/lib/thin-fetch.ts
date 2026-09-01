/**
 * Thin-fetch detection — flags sources whose remote (Firecrawl) fetch returned
 * page chrome instead of real content: a YouTube watch page with no transcript,
 * an auth gate, a Google/Cloud error page. The source is fine; the fetch is
 * what's broken. `runGeneration` uses this to mark such a source `status: "thin"`
 * and fail the digest with a specific, user-facing error rather than burning a
 * Gemini quota call on material with no substance.
 *
 * This is Part A of `plans/source-quality-and-upload.md`. Part B (a statistical
 * signal-density threshold fitted against a labelled corpus) is deliberately
 * gated on sample size — see that plan's "Why signal-density scoring is
 * deferred" section.
 *
 * The matcher is a pure function with a fixed marker list and no AWS dependency
 * — a clean local-model task, including its unit tests.
 */

// Markers that mean "the fetch scraped the shell, not the article." Checked in
// the first ~1,000 chars only (see below): an article *about* error handling
// contains "That's an error" in its body, so anywhere-in-doc matching would
// false-positive.
//
// "That's an error" is a strong single marker — a real article won't contain
// Google's error page. The rest ("Skip navigation", "Show transcript",
// "Sign in") are weaker: an article could legitimately quote UI copy — so a
// single instance does not trip the detector; two-or-more are required.
const THIN_FETCH_MARKERS = [
  "That's an error", // Google / Cloud error page (curly apostrophe normalized below)
  "Skip navigation", // page chrome
  "Show transcript", // YouTube watch page with no transcript fetched
  "Sign in", // auth-gate chrome
] as const;

// Only inspect the first N chars — an article *about* error handling contains
// error strings in its body, so a far-in-document match is not a signal.
const FIRST_CHARS_CHECKED = 1_000;

export interface ThinFetchFinding {
  /** Marker strings found, in marker-list order. */
  readonly markers: readonly string[];
  /** Human-readable reason for the digest error message. */
  readonly reason: string;
}

/**
 * Detect page-chrome / failure markers near the start of scraped content.
 * Returns a finding if the fetch is very likely to have captured chrome
 * instead of content, else null.
 *
 * Curly apostrophes (U+2018/U+2019/U+201A/U+02BC) are normalized to ASCII
 * before matching so Google's "That’s an error" (U+2019) matches the marker.
 */
export function detectThinFetch(content: string): ThinFetchFinding | null {
  const slice = content.slice(0, FIRST_CHARS_CHECKED).replace(/[\u2018\u2019\u201a\u02bc]/g, "'");

  const matched = THIN_FETCH_MARKERS.filter((marker) => slice.includes(marker));
  const strong = matched.includes(THIN_FETCH_MARKERS[0]);

  // "That's an error" alone is sufficient; otherwise require two-or-more of the
  // weaker markers so a single quoted instance of UI copy can't trip it.
  if (!strong && matched.length < 2) return null;

  const count = matched.length;
  return {
    markers: matched,
    reason: `${count} fetch-failure marker${count === 1 ? "" : "s"} in source material (${matched.join(", ")})`,
  };
}
