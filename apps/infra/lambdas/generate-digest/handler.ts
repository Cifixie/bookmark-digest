/**
 * generate-digest Lambda — Phase-1 digest generation (DynamoDB).
 * Calls Bedrock (Claude) for structured output using @bookmark-digest/catalog's digestBlockSchema.
 *
 * Trigger: POST /digests via API Gateway.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { digestBlockSchema } from "@bookmark-digest/catalog";
import { randomUUID } from "crypto";
import {
  digestsGet,
  digestsPut,
  digestsQueryBySourceHash,
  digestsUpdate,
  sourcesGet,
} from "../../lib/dynamo";
import { getDigestGoal } from "../../lib/digest-goals";

const MAX_RETRIES = parseInt(process.env.DIGEST_MAX_RETRIES ?? "3", 10);
const GENERATION_MODEL = process.env.BEDROCK_MODEL ?? "anthropic.claude-sonnet-4-0-20250514-v1:0";
const MAX_TOKENS = parseInt(process.env.DIGEST_MAX_TOKENS ?? "4096", 10);

// --- Lambda handler ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export async function handler(event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  if (event.body === undefined) return { statusCode: 200, headers: corsHeaders, body: "" };

  let body: any;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const sourceHash = body.sourceHash;
  const digestGoal = body.digestGoal;
  const modifiers = body.modifiers;

  if (!sourceHash) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash required" }) };
  if (!digestGoal) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "digestGoal required" }) };
  }

  let goalConfig;
  try {
    goalConfig = getDigestGoal(digestGoal);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Invalid digestGoal: ${digestGoal}` }) };
  }

  try {
    // Check for existing pending digest (SourceHashIndex GSI query)
    const existingResult = await digestsQueryBySourceHash(sourceHash, digestGoal);
    const existingItems = existingResult?.Items;
    const existingPending = existingItems?.find(
      (item: any) => item.status === "pending" || item.status === "generating"
    );

    if (existingPending) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ digestId: existingPending.id, status: "accepted" }) };
    }

    // Create new digest row
    const digestId = randomUUID();
    const now = new Date().toISOString();
    const paramsVersion = `catalog@${process.env.CATALOG_VERSION ?? "0.0.0"}-goals@${digestGoal}`;

    await digestsPut({
      id: digestId,
      sourceHash,
      digestGoal,
      modifiers: modifiers ?? {},
      paramsVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Fetch source content
    const sourceResult = await sourcesGet(sourceHash);
    const sourceItem = sourceResult?.Item as any;
    const content = sourceItem?.content;

    if (!content) {
      await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
        ":status": "failed",
        ":err": "No content",
        ":model": GENERATION_MODEL,
        ":at": now,
        "#s": "status",
        "#e": "error",
        "#m": "model",
        "#ca": "completedAt",
      });
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Source has no content" }) };
    }

    // Assemble prompt
    const modifierHints = Object.entries(modifiers ?? {})
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");

    const systemPrompt = [
      goalConfig.promptTemplate,
      modifierHints ? `Modifiers: ${modifierHints}` : "",
      `You may use: ${goalConfig.allowedBlockTypes.join(", ")}.`,
      "Respond with a JSON array of blocks. Each block has 'type' and 'props' fields.",
    ].filter(Boolean).join("\n");

    // Generate with retries
    let blocks: unknown[] | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      try {
        const result = await generateObject({
          model: anthropic(GENERATION_MODEL as any),
          system: systemPrompt,
          prompt: `Content:\n${content}`,
          schema: z.array(digestBlockSchema),
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
        });

        const validated = z.array(z.record(z.string(), z.unknown())).safeParse(result.object);
        if (validated.success) { blocks = result.object; break; }
      } catch (err) {
        console.error(`Attempt ${attempt} failed:`, err);
      }
    }

    if (blocks === null) {
      await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
        ":status": "failed",
        ":err": "Generation failed after retries",
        ":model": GENERATION_MODEL,
        ":at": now,
        "#s": "status",
        "#e": "error",
        "#m": "model",
        "#ca": "completedAt",
      });
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Generation failed" }) };
    }

    // Save result
    await digestsUpdate(digestId, "SET #s = :status, #o = :output, #m = :model, #ca = :at, #u = :u", {
      ":status": "done",
      ":output": blocks,
      ":model": GENERATION_MODEL,
      ":at": now,
      ":u": now,
      "#s": "status",
      "#o": "output",
      "#m": "model",
      "#ca": "completedAt",
      "#u": "updatedAt",
    });

    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ digestId, status: "done" }) };
  } catch (err) {
    console.error("Generate digest failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
