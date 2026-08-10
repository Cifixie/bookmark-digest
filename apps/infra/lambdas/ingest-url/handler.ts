/**
 * ingest-url Lambda — Phase-1 ingestion entry point (DynamoDB).
 * Receives a URL, fetches content via Firecrawl, deduplicates, stores in DynamoDB.
 * Trigger: POST /sources via API Gateway.
 */

import { createHash } from "crypto";
import { sourcesPut, sourcesQueryByUrl } from "../../lib/dynamo";
import { FIRECRAWL_API_URL } from "../../lib/config";

// --- Firecrawl fetch ---

async function fetchWithFirecrawl(url: string): Promise<{ markdown: string } | null> {
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
      return { markdown: data.data.markdown };
    }
    return null;
  } catch (err) {
    console.error("Firecrawl fetch failed:", err);
    return null;
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

    // Fetch content
    const fetched = await fetchWithFirecrawl(url);
    if (!fetched) {
      return { statusCode: 422, headers: corsHeaders, body: JSON.stringify({ error: "Failed to fetch content" }) };
    }

    const contentHash = createHash("sha256").update(fetched.markdown).digest("hex");
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
          content: fetched.markdown,
          contentType: "article",
          fetchedAt: now,
          fetchedBy: "firecrawl",
          status: "embedding",
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
