/**
 * list-sources Lambda — returns all ingested sources (no sourceHash parameter).
 *
 * Trigger: GET /sources (via API Gateway, proxy integration).
 * Uses a DynamoDB scan with index selection based on request context.
 */

import { sourcesScan, sourcesQueryByUrl } from "../../lib/dynamo";

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
    const result = await sourcesScan();
    const rawItems = result?.Items as any[] | undefined;

    // DynamoDB key is contentHash; frontend calls it sourceHash.
    // Map each item to the shape the frontend expects.
    const sources = (rawItems ?? []).map((item) => ({
      sourceHash: item.contentHash,
      url: item.url,
      contentType: item.contentType,
      fetchedAt: item.fetchedAt,
      fetchedBy: item.fetchedBy,
      status: item.status,
      embedding: item.embedding,
      embeddingModel: item.embeddingModel,
    }));

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
