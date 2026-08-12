/**
 * list-sources Lambda — returns all ingested sources, optionally filtered.
 *
 * Trigger: GET /sources (via API Gateway, proxy integration).
 *
 * Query-string params:
 *   - contentType: exact match ("article" | "video" | "unknown")
 *   - status:      exact match ("fetched" | "embedding" | "ready" | "failed")
 *   - q:           case-insensitive substring matched against title + url
 *   - from:        ISO date — returned items fetchedAt >= this
 *   - to:          ISO date — returned items fetchedAt <= this
 *
 * FilterExpression handles contentType, status, and date range (DynamoDB-native).
 * The `q` substring filter is applied post-scan in Lambda code because
 * DynamoDB's contains() can't case-fold and doesn't union title+url easily.
 */

import { sourcesScan } from "../../lib/dynamo";

export async function handler(event: { queryStringParameters?: Record<string, string> }): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };

  try {
    const params = event.queryStringParameters ?? {};
    const { contentType, status, q, from, to } = params;

    // Build DynamoDB FilterExpression for the params that support it natively.
    // `url` and `status` are DynamoDB reserved words — hence the # aliases.
    const filterParts: string[] = [];
    const expressionAttrNames: Record<string, string> = { "#url": "url", "#s": "status" };
    const expressionAttrValues: Record<string, unknown> = {};

    if (contentType) {
      filterParts.push("contentType = :ct");
      expressionAttrValues[":ct"] = contentType;
    }
    if (status) {
      filterParts.push("#s = :st");
      expressionAttrValues[":st"] = status;
    }
    if (from || to) {
      if (from && to) filterParts.push("fetchedAt >= :from AND fetchedAt <= :to");
      else if (from) filterParts.push("fetchedAt >= :from");
      else filterParts.push("fetchedAt <= :to");
      if (from) expressionAttrValues[":from"] = from;
      if (to) expressionAttrValues[":to"] = to;
    }

    const filterExpression = filterParts.length > 0 ? filterParts.join(" AND ") : undefined;
    const projectionFields = "contentHash, #url, contentType, fetchedAt, fetchedBy, #s, title, embeddingModel";

    const result = await sourcesScan(
      filterExpression,
      { ...expressionAttrNames, ...expressionAttrValues },
      projectionFields,
    );
    const rawItems = result?.Items as any[] | undefined;

    // DynamoDB key is contentHash; frontend calls it sourceHash. `embedded`
    // stands in for the embedding itself, which is far too large to ship to
    // a browser.
    const sources = (rawItems ?? [])
      .map((item) => ({
        sourceHash: item.contentHash,
        url: item.url,
        contentType: item.contentType,
        fetchedAt: item.fetchedAt,
        fetchedBy: item.fetchedBy,
        status: item.status,
        title: item.title ?? null,
        embedded: Boolean(item.embeddingModel),
        embeddingModel: item.embeddingModel,
      }))
      // Apply `q` filter in Lambda code (case-insensitive substring against
      // title + url) — simpler than a DynamoDB contains() + or() combo.
      .filter((item) => {
        if (!q) return true;
        const qLower = q.toLowerCase();
        const titleMatch = item.title ? item.title.toLowerCase().includes(qLower) : false;
        const urlMatch = item.url.toLowerCase().includes(qLower);
        return titleMatch || urlMatch;
      });

    // Newest first — the UI's "latest source" panel depends on this order.
    sources.sort((a, b) => String(b.fetchedAt ?? "").localeCompare(String(a.fetchedAt ?? "")));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ sources }),
    };
  } catch (err) {
    console.error("List sources failed:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
