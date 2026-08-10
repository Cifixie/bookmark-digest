/**
 * generate-digest Lambda — Phase-1 digest generation (DynamoDB).
 * Calls Gemini for structured output using @bookmark-digest/catalog's digestBlockSchema.
 *
 * Trigger: POST /digests via API Gateway.
 */

import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { z } from "zod";
import { digestBlockSchema } from "@bookmark-digest/catalog";
import { randomUUID } from "crypto";
import { GEMINI_MODEL_ID, DIGEST_MAX_RETRIES, DIGEST_MAX_TOKENS } from "../../lib/config";
import {
  digestsGet,
  digestsPut,
  digestsQueryBySourceHash,
  digestsUpdate,
  sourcesGet,
} from "../../lib/dynamo";
import { getDigestGoal } from "../../lib/digest-goals";

const MAX_RETRIES = DIGEST_MAX_RETRIES;
const GENERATION_MODEL = process.env.GEMINI_MODEL ?? GEMINI_MODEL_ID;
const MAX_TOKENS = DIGEST_MAX_TOKENS;

const secretsClient = new SecretsManagerClient({});
let cachedGoogleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

async function getGoogleProvider() {
  if (cachedGoogleProvider) return cachedGoogleProvider;

  const secretArn = process.env.GEMINI_API_KEY_SECRET_ARN;
  if (!secretArn) throw new Error("GEMINI_API_KEY_SECRET_ARN not set");

  const secret = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const { apiKey } = JSON.parse(secret.SecretString ?? "{}");
  if (!apiKey) throw new Error("Gemini secret missing 'apiKey' field");

  cachedGoogleProvider = createGoogleGenerativeAI({ apiKey });
  return cachedGoogleProvider;
}

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
    ].filter(Boolean).join("\n");

    // Generate with retries
    const google = await getGoogleProvider();
    let blocks: unknown[] | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      try {
        const result = await generateObject({
          model: google(GENERATION_MODEL),
          system: systemPrompt,
          prompt: `Content:\n${content}`,
          // Gemini's structured-output schema requires a top-level "object" type —
          // a bare top-level array is rejected.
          schema: z.object({ blocks: z.array(digestBlockSchema) }),
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
        });

        const validated = z.array(z.record(z.string(), z.unknown())).safeParse(result.object.blocks);
        if (validated.success) { blocks = result.object.blocks; break; }
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
