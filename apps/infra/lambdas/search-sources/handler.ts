/**
 * search-sources Lambda — semantic search over the Sources table.
 *
 * Accepts a query string, embeds it via Bedrock Titan, scans the Sources
 * table for all embedded items, ranks by cosine similarity, and returns
 * the top N results.
 *
 * Trigger: GET /sources/search?q=<query> (via API Gateway, proxy integration).
 * Mounted as a sibling resource of /sources/{sourceHash} — API Gateway
 * resolves the literal "search" segment before the {sourceHash} path param,
 * same pattern as e.g. "/users/me" vs "/users/{id}".
 *
 * Query-string params:
 *   - q:       required — the search query (will be embedded)
 *   - count:   optional — number of results (default 5, max 20)
 *   - from:    optional — ISO date — only sources fetchedAt >= this
 *   - to:      optional — ISO date — only sources fetchedAt <= this
 *
 * Similar to `list-sources` but uses embedding-based ranking instead of
 * structural filter + substring match. Good for finding content by topic
 * or intent rather than exact text.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { sourcesScan } from "../../lib/dynamo";
import { rankBySimilarity } from "../../lib/similarity";
import { BEDROCK_EMBEDDING_MODEL_ID, BEDROCK_EMBEDDING_DIMENSIONS } from "../../lib/config";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const bedrockClient = new BedrockRuntimeClient({});

/** Titan v2 expects inputText as a JSON body with model-id in the route. */
async function embedText(text: string): Promise<number[]> {
  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: BEDROCK_EMBEDDING_MODEL_ID,
      body: JSON.stringify({ inputText: text }),
      contentType: "application/json",
      accept: "application/json",
    })
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const embedding = body?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Bedrock returned no embedding");
  }
  return embedding as number[];
}

/** Sanity-check: embeddings must have the expected dimension. */
function validateEmbeddingDimensions(embedding: number[], expected: number): void {
  if (embedding.length !== expected) {
    throw new Error(
      `Expected embedding of ${expected} dimensions, got ${embedding.length}. ` +
        `Check that BEDROCK_EMBEDDING_MODEL_ID and BEDROCK_EMBEDDING_DIMENSIONS match.`
    );
  }
}

export async function handler(event: { queryStringParameters?: Record<string, string> }): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  try {
    const params = event.queryStringParameters ?? {};
    const query = params.q;
    if (!query) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "q parameter required" }) };
    }

    const requestedCount = parseInt(params.count ?? "", 10);
    const count = Number.isFinite(requestedCount) && requestedCount > 0
      ? Math.min(requestedCount, 20)
      : 5;

    const filterParts: string[] = [];
    const expressionAttrValues: Record<string, unknown> = {};

    if (params.from || params.to) {
      if (params.from && params.to) filterParts.push("fetchedAt >= :from AND fetchedAt <= :to");
      else if (params.from) filterParts.push("fetchedAt >= :from");
      else filterParts.push("fetchedAt <= :to");
      if (params.from) expressionAttrValues[":from"] = params.from;
      if (params.to) expressionAttrValues[":to"] = params.to;
    }

    const filterExpression = filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

    // Scan for all embedded sources. Projection excludes `content` (too large).
    const projectionFields = "contentHash, #url, contentType, fetchedAt, title, embedding";

    const scanResult = await sourcesScan(
      filterExpression,
      { ...expressionAttrValues, "#url": "url" },
      projectionFields,
    );
    const rawItems = scanResult?.Items as Array<{
      contentHash: string;
      url: string;
      contentType: string;
      fetchedAt: string;
      title?: string | null;
      embedding?: number[];
    }> | undefined;

    const queryEmbedding = await embedText(query);
    validateEmbeddingDimensions(queryEmbedding, BEDROCK_EMBEDDING_DIMENSIONS);

    // `excludeContentHash: ""` because we're ranking against the whole
    // table, not excluding a source that triggered the query.
    const ranked = rankBySimilarity(rawItems ?? [], queryEmbedding, "", count);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: ranked, count: ranked.length }),
    };
  } catch (err) {
    console.error("Search sources failed:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
