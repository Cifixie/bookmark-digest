/**
 * search-digests Lambda — semantic search over the Digests table.
 *
 * Accepts a query string, embeds it via Bedrock Titan, scans the Digests
 * table for items with `embedding` (multi-source digests), ranks by cosine
 * similarity, and returns the top N results.
 *
 * Trigger: GET /digests/search?q=<query> (via API Gateway, proxy integration).
 * Mounted as a sibling resource of /digests/{digestId} — API Gateway resolves
 * the literal "search" segment before the {digestId} path param.
 *
 * Query-string params:
 *   - q:       required — the search query (will be embedded)
 *   - count:   optional — number of results (default 5, max 20)
 *   - from:    optional — ISO date — only digests createdAt >= this
 *   - to:      optional — ISO date — only digests createdAt <= this
 *
 * Mirrors `search-sources` but operates on the Digests table. Only returns
 * digests that have an embedding (multi-source digests with synopsis).
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { digestsScan } from "../../lib/dynamo";
import { rankBySimilarity, type ScoredSource } from "../../lib/similarity";
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
    }),
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
        `Check that BEDROCK_EMBEDDING_MODEL_ID and BEDROCK_EMBEDDING_DIMENSIONS match.`,
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
      if (params.from && params.to) filterParts.push("createdAt >= :from AND createdAt <= :to");
      else if (params.from) filterParts.push("createdAt >= :from");
      else filterParts.push("createdAt <= :to");
      if (params.from) expressionAttrValues[":from"] = params.from;
      if (params.to) expressionAttrValues[":to"] = params.to;
    }

    // Only include digests that have an embedding (i.e. multi-source with synopsis)
    filterParts.push("attribute_exists(embedding)");

    const filterExpression = filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

    // Scan for all embedded digests. Projection excludes `output` (the Spec tree is too large).
    const projectionFields = "id, sourceHash, sourceHashes, digestGoal, status, meta, createdAt, embedding";

    const scanResult = await digestsScan(
      filterExpression,
      expressionAttrValues,
      projectionFields,
    );
    const rawItems = scanResult?.Items as Array<{
      id: string;
      sourceHash: string;
      digestGoal: string;
      status: string;
      meta: Record<string, unknown> | null;
      createdAt: string;
      embedding?: number[];
    }> | undefined;

    const queryEmbedding = await embedText(query);
    validateEmbeddingDimensions(queryEmbedding, BEDROCK_EMBEDDING_DIMENSIONS);

    // `excludeContentHash: ""` because we're ranking against the whole
    // table, not excluding a digest that triggered the query.
    const ranked = rankBySimilarity(
      rawItems?.map((item) => ({
        contentHash: item.id,
        url: item.sourceHash, // sourceHash is a proxy for the digest identifier
        contentType: item.digestGoal,
        fetchedAt: item.createdAt,
        title: item.meta?.synopsis
          ? (item.meta.synopsis as string).slice(0, 100)
          : `${item.digestGoal} · ${new Date(item.createdAt).toLocaleDateString()}`,
        embedding: item.embedding,
      })) ?? [],
      queryEmbedding,
      "",
      count,
    );

    // Map back to digest-specific shape
    const results: Array<{
      id: string;
      sourceHash: string;
      digestGoal: string;
      status: string;
      meta: Record<string, unknown> | null;
      createdAt: string;
      score: number;
    }> = [];
    for (const scored of ranked) {
      const item = rawItems?.find((i) => i.id === scored.contentHash);
      if (item) {
        results.push({
          id: item.id,
          sourceHash: item.sourceHash,
          digestGoal: item.digestGoal,
          status: item.status,
          meta: item.meta,
          createdAt: item.createdAt,
          score: scored.score,
        });
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: results, count: results.length }),
    };
  } catch (err) {
    console.error("Search digests failed:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
