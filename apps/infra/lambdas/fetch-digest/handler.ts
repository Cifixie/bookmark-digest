/**
 * fetch-digest Lambda — GET /digests/{digestId} (DynamoDB).
 *
 * Also supports: GET /digests?sourceHash=<hash> to list digests for a source
 * (closes C.5 — was previously deferred, now free with SourceHashIndex GSI).
 */

import { digestsGet, digestsQueryBySourceHash } from "../../lib/dynamo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export async function handler(event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const digestId = event.pathParameters?.digestId;
  const sourceHash = event.queryStringParameters?.sourceHash;

  // List mode: GET /digests?sourceHash=<hash>
  if (sourceHash && !digestId) {
    try {
      const result = await digestsQueryBySourceHash(sourceHash);
      const items = result?.Items as any[] | undefined;

      const digests = (items ?? []).map((item: any) => {
        let output: unknown[] | null = null;
        try {
          if (item.output) output = item.output;
        } catch { /* malformed output */ }

        return {
          id: item.id,
          sourceHash: item.sourceHash,
          digestGoal: item.digestGoal,
          paramsVersion: item.paramsVersion,
          status: item.status,
          output,
          error: item.error ?? null,
          model: item.model ?? null,
          createdAt: item.createdAt,
          completedAt: item.completedAt ?? null,
        };
      });

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

  // Single digest mode: GET /digests/{digestId}
  if (!digestId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "digestId required (or provide sourceHash query param for list)" }) };

  try {
    const result = await digestsGet(digestId);
    const item = result?.Item as any;
    if (!item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Digest not found" }) };

    let output: unknown[] | null = null;
    try {
      if (item.output) output = item.output;
    } catch { /* malformed output */ }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        id: item.id,
        sourceHash: item.sourceHash,
        digestGoal: item.digestGoal,
        paramsVersion: item.paramsVersion,
        status: item.status,
        output,
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
