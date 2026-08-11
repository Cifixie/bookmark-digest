/**
 * list-sources Lambda — returns all ingested sources (no sourceHash parameter).
 *
 * Trigger: GET /sources (via API Gateway, proxy integration).
 *
 * Backs the multi-source picker, so it needs the whole list rather than a
 * page: sourcesScan paginates to completion. Projects only the picker's
 * fields — `content` and `embedding` are both large and neither is used by
 * any caller, and shipping embeddings to the browser would dominate the
 * response for no benefit.
 */

import { sourcesScan } from "../../lib/dynamo";

export async function handler(): Promise<{
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
    // `url` and `status` are DynamoDB reserved words — hence the # aliases.
    const result = await sourcesScan(
      undefined,
      { "#url": "url", "#s": "status" },
      "contentHash, #url, contentType, fetchedAt, fetchedBy, #s, embeddingModel"
    );
    const rawItems = result?.Items as any[] | undefined;

    // DynamoDB key is contentHash; frontend calls it sourceHash.
    // Map each item to the shape the frontend expects. `embedded` stands in
    // for the embedding itself, which is far too large to ship to a browser.
    const sources = (rawItems ?? []).map((item) => ({
      sourceHash: item.contentHash,
      url: item.url,
      contentType: item.contentType,
      fetchedAt: item.fetchedAt,
      fetchedBy: item.fetchedBy,
      status: item.status,
      embedded: Boolean(item.embeddingModel),
      embeddingModel: item.embeddingModel,
    }));

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
