/**
 * digest-goals Lambda — GET /digest-goals
 * Returns the DIGEST_GOALS configuration as JSON.
 */

import { listDigestGoalsResponseSchema } from "@bookmark-digest/schemas";
import { DIGEST_GOALS, SOURCE_MODES } from "../../lib/digest-goals";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export async function handler(): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  // Only the client-facing fields — promptTemplate stays server-side.
  const response = listDigestGoalsResponseSchema.parse({
    goals: DIGEST_GOALS,
    sourceModes: SOURCE_MODES.map(({ mode, label, description }) => ({ mode, label, description })),
    version: process.env.CATALOG_VERSION ?? "0.0.0",
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}
