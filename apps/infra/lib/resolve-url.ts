/**
 * Resolves a submitted URL to its actual target before ingestion, so
 * wrapper/shortener links (Google Search redirects, tinyurl, bit.ly, etc.)
 * dedup and get scraped as the real page rather than as a distinct wrapper
 * URL. Fails open: any error or timeout returns the input unchanged rather
 * than blocking ingestion.
 */

const RESOLVE_TIMEOUT_MS = 5000;

/**
 * Unwraps Google's `google.com/url?q=...` link format. This is not an HTTP
 * redirect — the target lives in a query param, so a `fetch` redirect-follow
 * never sees it. (Google's newer `share.google/<id>` shortener is a plain
 * HTTP 3xx chain and needs no special-casing here.)
 */
function unwrapGoogleUrlParam(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const isGoogleHost = /^(www\.)?google\.[a-z.]+$/i.test(parsed.hostname);
  if (!isGoogleHost || parsed.pathname !== "/url") return url;

  const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
  return target || url;
}

/**
 * Follows real HTTP redirect chains (tinyurl, bit.ly, t.co, share.google,
 * ...) and returns the final resolved URL. Tries HEAD first since we only
 * need the final URL, not the body; some shorteners reject HEAD, so a
 * non-2xx response falls back to GET.
 */
async function followRedirects(url: string): Promise<string> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) });
      if (res.ok) return res.url || url;
    } catch {
      // try the next method, or fail open below
    }
  }
  return url;
}

export async function resolveUrl(url: string): Promise<string> {
  const unwrapped = unwrapGoogleUrlParam(url);
  return followRedirects(unwrapped);
}
