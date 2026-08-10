/**
 * related-sources Lambda — GET /sources/{sourceHash}/related
 *
 * Backs the RelatedFromYourBookmarks non-catalog section (see
 * packages/catalog/src/nonCatalog/RelatedFromYourBookmarks.schema.ts).
 * Replaces pgvector's ANN index with a brute-force cosine similarity scan —
 * see plans/dynamodb-migration.md §2 for why that's the right trade-off here.
 */

import { sourcesGet, sourcesScan } from "../../lib/dynamo";
import { rankBySimilarity } from "../../lib/similarity";
import { RELATED_DEFAULT_COUNT, RELATED_MAX_COUNT } from "../../lib/config";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export async function handler(event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const sourceHash = event.pathParameters?.sourceHash;
  if (!sourceHash) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash required" }) };

  const requestedCount = parseInt(event.queryStringParameters?.count ?? "", 10);
  const count = Number.isFinite(requestedCount) && requestedCount > 0
    ? Math.min(requestedCount, RELATED_MAX_COUNT)
    : RELATED_DEFAULT_COUNT;

  try {
    const sourceResult = await sourcesGet(sourceHash);
    const source = sourceResult?.Item as { embedding?: number[]; status?: string } | undefined;

    if (!source) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Source not found" }) };
    if (!source.embedding || source.embedding.length === 0) {
      // Not embedded yet (or embedding failed) — no basis for similarity, not an error.
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items: [] }) };
    }

    const scanResult = await sourcesScan("#s = :ready", { ":ready": "ready", "#s": "status" });
    const candidates = (scanResult?.Items ?? []) as Array<{
      contentHash: string;
      url: string;
      contentType: string;
      fetchedAt: string;
      embedding?: number[];
    }>;

    const items = rankBySimilarity(candidates, source.embedding, sourceHash, count);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error("Related sources lookup failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
