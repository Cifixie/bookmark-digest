import { randomUUID } from "crypto";
import {
  submitUrlRequestSchema,
  type SubmitUrlResponse,
} from "@bookmark-digest/schemas";

/**
 * Phase-0 ingest Lambda.
 * Accepts a URL via API Gateway, validates it, and (eventually) kicks off
 * the Step Functions state machine + writes a row to Postgres. For now it
 * just validates and echoes back a fake job so the async shape can be
 * proven before real logic goes in.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST",
};

export async function handler(event: { body: string }) {
  const body = JSON.parse(event.body ?? "{}");
  const parsed = submitUrlRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: parsed.error.flatten() }),
    };
  }

  // TODO Phase-0: write bookmark row to Postgres, start Step Functions execution
  const response: SubmitUrlResponse = {
    bookmarkId: randomUUID(),
    jobId: randomUUID(),
    status: "received",
  };

  return {
    statusCode: 202,
    headers: corsHeaders,
    body: JSON.stringify(response),
  };
}
