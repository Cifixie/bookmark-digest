/**
 * fetch-digest Lambda — GET /digests/{digestId} (DynamoDB).
 *
 * Also supports two list modes on the same GET /digests route (there is only
 * one API Gateway integration for that resource+method, so all "list" shapes
 * live in this handler rather than a separate Lambda mounted on the same path):
 *   - GET /digests?sourceHash=<hash>  — digests for one source (closes C.5 —
 *     was previously deferred, now free with SourceHashIndex GSI).
 *   - GET /digests?<digestGoal|status|q|from|to>  — full list with structural
 *     filter + substring search (Phase-3 browse). Returns lightweight rows
 *     (no `output` Spec tree) since Browse never needs the full render tree.
 */

import { digestsGet, digestsQueryBySourceHash, digestsScan } from "../../lib/dynamo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

/** GET /digests?digestGoal=&status=&q=&from=&to=&tags= — full list, lightweight rows. */
async function listAll(params: Record<string, string>) {
  const { digestGoal, status, q, from, to, tags } = params;

  const filterParts: string[] = [];
  const expressionAttrNames: Record<string, string> = { "#s": "status" };
  const expressionAttrValues: Record<string, unknown> = {};

  if (digestGoal) {
    filterParts.push("digestGoal = :dg");
    expressionAttrValues[":dg"] = digestGoal;
  }
  if (status) {
    filterParts.push("#s = :st");
    expressionAttrValues[":st"] = status;
  }
  if (from || to) {
    if (from && to) filterParts.push("createdAt >= :from AND createdAt <= :to");
    else if (from) filterParts.push("createdAt >= :from");
    else filterParts.push("createdAt <= :to");
    if (from) expressionAttrValues[":from"] = from;
    if (to) expressionAttrValues[":to"] = to;
  }

  const filterExpression = filterParts.length > 0 ? filterParts.join(" AND ") : undefined;
  const projectionFields =
    "id, sourceHash, sourceHashes, digestGoal, #s, sourceMode, meta, createdAt, completedAt, model, embedding, embeddingAt";

  const result = await digestsScan(
    filterExpression,
    { ...expressionAttrNames, ...expressionAttrValues },
    projectionFields,
  );
  const rawItems = result?.Items as any[] | undefined;

  const digests = (rawItems ?? [])
    .map((item) => ({
      id: item.id,
      sourceHash: item.sourceHash,
      sourceHashes: item.sourceHashes ?? null,
      digestGoal: item.digestGoal,
      sourceMode: item.sourceMode ?? null,
      status: item.status,
      multiSourceCount: (item.sourceHashes ?? [item.sourceHash]).length,
      meta: item.meta ?? null,
      createdAt: item.createdAt,
      completedAt: item.completedAt ?? null,
      model: item.model ?? null,
      embedded: Boolean(item.embedding),
      embeddingModel: item.embeddingModel,
    }))
    .filter((item) => {
      // Tags filter: match if any meta tag (case-insensitive) is in the filter list
      if (tags) {
        const tagFilter = new Set(tags.toLowerCase().split(",").map((t) => t.trim()));
        const metaTags = item.meta?.tags as string[] | undefined;
        if (!metaTags || metaTags.length === 0) return false;
        return metaTags.some((t) => tagFilter.has(t.toLowerCase()));
      }
      if (!q) return true;
      const qLower = q.toLowerCase();
      return (
        item.id.toLowerCase().includes(qLower) ||
        item.sourceHash.toLowerCase().includes(qLower) ||
        (item.sourceHashes?.some((h: string) => h.toLowerCase().includes(qLower)) ?? false)
      );
    });

  digests.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return digests;
}

export async function handler(event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const digestId = event.pathParameters?.digestId;
  const params: Record<string, string> = event.queryStringParameters ?? {};
  const sourceHash = params.sourceHash;

  // List mode: GET /digests?sourceHash=<hash>
  if (sourceHash && !digestId) {
    try {
      const result = await digestsQueryBySourceHash(sourceHash);
      const items = result?.Items as any[] | undefined;

      const digests = (items ?? []).map((item: any) => ({
        id: item.id,
        sourceHash: item.sourceHash,
        digestGoal: item.digestGoal,
        paramsVersion: item.paramsVersion,
        status: item.status,
        output: item.output ?? null,
        meta: item.meta ?? null,
        error: item.error ?? null,
        model: item.model ?? null,
        createdAt: item.createdAt,
        completedAt: item.completedAt ?? null,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ digests }),
      };
    } catch (err) {
      console.error("Fetch digests by sourceHash failed:", err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
    }
  }

  // List mode: GET /digests (no sourceHash, no digestId) — full list + filters.
  if (!digestId && !sourceHash) {
    try {
      const digests = await listAll(params);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ digests }) };
    } catch (err) {
      console.error("List digests failed:", err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
    }
  }

  // Single digest mode: GET /digests/{digestId}
  try {
    const result = await digestsGet(digestId);
    const item = result?.Item as any;
    if (!item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Digest not found" }) };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        id: item.id,
        sourceHash: item.sourceHash,
        sourceHashes: item.sourceHashes ?? null,
        digestGoal: item.digestGoal,
        paramsVersion: item.paramsVersion,
        status: item.status,
        output: item.output ?? null,
        meta: item.meta ?? null,
        error: item.error ?? null,
        model: item.model ?? null,
        createdAt: item.createdAt,
        completedAt: item.completedAt ?? null,
      }),
    };
  } catch (err) {
    console.error("Fetch digest failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
