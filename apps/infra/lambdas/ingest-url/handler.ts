/**
 * ingest-url Lambda — Phase-1 ingestion entry point (DynamoDB).
 * Receives a URL, fetches content via Firecrawl (or takes pasted content
 * directly), deduplicates, stores in DynamoDB.
 * Trigger: POST /sources via API Gateway.
 *
 * A dedicated YouTube transcript fetcher (InnerTube caption endpoint) lived
 * here briefly but was reverted: from Lambda's shared IP ranges it silently
 * came back with no caption tracks on most requests (no error — YouTube's
 * anti-abuse system just declines to serve captions to that caller), while
 * working fine from a residential IP. That made it unreliable in exactly the
 * environment it has to run in. See `plans/thin-source-detection.md` for the
 * incident that motivated it. The `content` field below — paste the
 * transcript in by hand — is the replacement for video sources.
 */

import { createHash } from "crypto";
import { sourcesPut, sourcesQueryByUrl } from "../../lib/dynamo";
import { FIRECRAWL_API_URL } from "../../lib/config";

/** What a fetcher returns, ready to store. */
interface FetchedSource {
  content: string;
  /** Matches the schemas package's sourceContentType enum. */
  contentType: "article" | "video" | "unknown";
  /** Recorded on the row so a bad fetch is traceable to the fetcher that made it. */
  fetchedBy: string;
  /** Page title from Firecrawl metadata; null for pasted/manual content. */
  title: string | null;
}

const VALID_CONTENT_TYPES = new Set(["article", "video", "unknown"]);

// --- Firecrawl fetch ---

async function fetchWithFirecrawl(url: string): Promise<{ markdown: string; title: string | null } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("FIRECRAWL_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });

    if (!res.ok) {
      console.warn(`Firecrawl returned ${res.status}`);
      return null;
    }

    const data: any = await res.json();
    if (data.success && data.data?.markdown) {
      return { markdown: data.data.markdown, title: data.data.metadata?.title ?? null };
    }
    return null;
  } catch (err) {
    console.error("Firecrawl fetch failed:", err);
    return null;
  }
}

// --- Fetcher dispatch ---

/**
 * Fetches a URL via Firecrawl, unless the caller already supplied the content
 * (a manual paste — the affordance for sources Firecrawl can't get, like a
 * video transcript copied by hand from YouTube's own "Show transcript" panel).
 */
async function fetchSource(
  url: string,
  pasted?: { content: string; contentType?: string }
): Promise<FetchedSource | null> {
  if (pasted) {
    const contentType =
      pasted.contentType && VALID_CONTENT_TYPES.has(pasted.contentType)
        ? (pasted.contentType as FetchedSource["contentType"])
        : "unknown";
    return { content: pasted.content, contentType, fetchedBy: "manual", title: null };
  }

  const scraped = await fetchWithFirecrawl(url);
  return scraped
    ? { content: scraped.markdown, contentType: "article", fetchedBy: "firecrawl", title: scraped.title }
    : null;
}

/**
 * Display title: prefer Firecrawl's metadata title; fall back to
 * hostname + path so old/title-less rows still get a readable label.
 */
function displayTitle(url: string, fetchedTitle: string | null): string {
  if (fetchedTitle && fetchedTitle.trim().length > 0) return fetchedTitle.trim();
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

// --- Lambda handler ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export async function handler(event: { body?: string }): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  if (event.body === undefined) {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  let body: any;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const url = body.url;
  if (!url || typeof url !== "string") {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "URL is required" }) };
  }

  // Pasted content is an explicit opt-out of fetching: a non-empty string
  // means the caller already has the material (e.g. a transcript copied by
  // hand) and Firecrawl should not be tried at all.
  const pastedContent = typeof body.content === "string" ? body.content.trim() : "";
  const pasted = pastedContent
    ? { content: pastedContent, contentType: typeof body.contentType === "string" ? body.contentType : undefined }
    : undefined;

  try {
    // Check if URL already exists (dedup via UrlIndex GSI)
    const existingResult = await sourcesQueryByUrl(url);
    const existingItems = existingResult?.Items;

    if (existingItems && existingItems.length > 0) {
      const existing = existingItems[0] as { contentHash: string; status: string };
      // "ready" = already embedded; "embedding" = currently embedding (skip).
      // "failed" = re-accept for re-fetch/re-embed.
      if (existing.status === "ready" || existing.status === "embedding") {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sourceHash: existing.contentHash, status: "existing" }) };
      }
    }

    // Fetch content, unless it was pasted in directly
    const fetched = await fetchSource(url, pasted);
    if (!fetched) {
      return { statusCode: 422, headers: corsHeaders, body: JSON.stringify({ error: "Failed to fetch content" }) };
    }

    const contentHash = createHash("sha256").update(fetched.content).digest("hex");
    const now = new Date().toISOString();

    // Conditional put for idempotent insert. Status is set to "embedding"
    // directly on the INSERT (not via a follow-up UPDATE) because embed-source's
    // DynamoDB Stream trigger is filtered to INSERT events only — a separate
    // UPDATE would fire a MODIFY event that never reaches the Lambda, and
    // embed-source's status guard would then skip the stale "fetched" INSERT.
    try {
      await sourcesPut(
        {
          contentHash,
          url,
          content: fetched.content,
          contentType: fetched.contentType,
          fetchedAt: now,
          fetchedBy: fetched.fetchedBy,
          status: "embedding",
          title: displayTitle(url, fetched.title),
        },
        "attribute_not_exists(contentHash)"
      );

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({ sourceHash: contentHash, status: "new" }),
      };
    } catch (err: any) {
      // ConditionalCheckFailedException means it already existed
      if (err.name === "ConditionalCheckFailedException" || err.__type === "ConditionalCheckFailedException") {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sourceHash: contentHash, status: "existing" }) };
      }
      throw err;
    }
  } catch (err) {
    console.error("Ingest failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
