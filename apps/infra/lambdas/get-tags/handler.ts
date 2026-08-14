/**
 * get-tags Lambda — returns the tag vocabulary for Browse's tag filter/autocomplete.
 *
 * Trigger: GET /tags (via API Gateway, proxy integration).
 * Requires Cognito auth — same as /sources and /digests.
 *
 * Query-string params:
 *   - limit: optional — number of results (default 100, max 500)
 *   - q:     optional — prefix filter for autocomplete (matched against displayTag)
 *
 * Returns tags sorted by usage count desc.
 */

import { tagsScan } from "../../lib/dynamo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export async function handler(event: { queryStringParameters?: Record<string, string> }): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  try {
    const params = event.queryStringParameters ?? {};
    const requestedLimit = parseInt(params.limit ?? "", 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 100;

    const allTags = await tagsScan();

    // Apply prefix filter if provided (autocomplete) BEFORE slicing to limit
    let filtered = allTags;
    if (params.q) {
      const qLower = params.q.toLowerCase();
      filtered = allTags.filter((t) =>
        t.displayTag.toLowerCase().includes(qLower),
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ tags: filtered.slice(0, limit), count: filtered.length }),
    };
  } catch (err) {
    console.error("Get tags failed:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
