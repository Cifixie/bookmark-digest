/**
 * fetch-source Lambda — GET /sources/{sourceHash} (DynamoDB).
 */

import { sourcesGet } from "../../lib/dynamo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export async function handler(event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const sourceHash = event.pathParameters?.sourceHash;
  if (!sourceHash) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash required" }) };

  try {
    const result = await sourcesGet(sourceHash);
    const item = result?.Item as any;
    if (!item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Source not found" }) };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        sourceHash: item.contentHash,
        url: item.url,
        content: item.content,
        contentType: item.contentType,
        fetchedAt: item.fetchedAt,
        fetchedBy: item.fetchedBy,
        status: item.status,
        title: item.title ?? null,
        description: item.description ?? null,
        ogImage: item.ogImage ?? null,
        siteName: item.siteName ?? null,
        embedding: item.embedding ?? null,
        embeddingModel: item.embeddingModel ?? null,
      }),
    };
  } catch (err) {
    console.error("Fetch source failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
