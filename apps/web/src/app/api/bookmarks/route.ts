import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  submitUrlRequestSchema,
  type SubmitUrlResponse,
} from "@bookmark-digest/schemas";

/**
 * Phase-0 stub. Replace with a real call to API Gateway/Lambda (or call
 * the Lambda logic directly if this route proxies to AWS). For now it
 * just validates input and echoes back a fake job so the frontend loop
 * can be proven end-to-end.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = submitUrlRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const response: SubmitUrlResponse = {
    bookmarkId: randomUUID(),
    jobId: randomUUID(),
    status: "received",
  };

  return NextResponse.json(response, { status: 202 });
}
