/**
 * ingest-url Lambda — Phase-1 ingestion entry point (DynamoDB).
 * Receives a URL, fetches content via Firecrawl, deduplicates, stores in DynamoDB.
 * Trigger: POST /sources via API Gateway.
 */

import { createHash } from "crypto";
import { sourcesPut, sourcesQueryByUrl, sourcesUpdate } from "../../lib/dynamo";

// --- Firecrawl fetch ---

async function fetchWithFirecrawl(url: string): Promise<{ markdown: string } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn("FIRECRAWL_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
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
      if (existing.status === "ready") {
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

    // Conditional put for idempotent insert
    try {
      await sourcesPut(
        {
          contentHash,
          url,
          content: fetched.markdown,
          contentType: "article",
          fetchedAt: now,
          fetchedBy: "firecrawl",
          status: "fetched",
        },
        "attribute_not_exists(contentHash)"
      );

      // Successfully inserted — transition to embedding. A targeted update
      // (not a full-item put) so it can't clobber the embedding/status fields
      // embed-source writes concurrently once the INSERT stream event fires.
      await sourcesUpdate(contentHash, "SET #s = :status", {
        ":status": "embedding",
        "#s": "status",
      });

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
