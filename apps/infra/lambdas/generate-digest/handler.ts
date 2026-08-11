/**
 * generate-digest Lambda — Phase-1 digest generation (DynamoDB).
 * Calls Gemini via @bookmark-digest/catalog's catalog.prompt(), asking it to
 * output json-render's native JSONL (RFC 6902 patch) format, then compiles
 * that into a Spec tree with @json-render/core's compileSpecStream().
 *
 * Trigger: POST /digests via API Gateway.
 *
 * API Gateway REST APIs hard-cap the integration timeout at 29s, well under
 * how long Gemini generation (with retries) can take. So the HTTP path only
 * validates the request and writes the "pending" row, then invokes this same
 * function asynchronously (InvocationType: Event) to do the actual
 * generation, and returns immediately. The frontend already polls
 * GET /digests/{id} for status, so this needs no client-side changes.
 *
 * Output format: json-render Spec tree (root + keyed elements) instead of flat DigestBlock[].
 */

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { compileSpecStream, autoFixSpec, type Spec } from "@json-render/core";
import { validateDigestSpec, catalog } from "@bookmark-digest/catalog";
import { randomUUID } from "crypto";
import { GEMINI_MODEL_ID, DIGEST_MAX_RETRIES, DIGEST_MAX_TOKENS } from "../../lib/config";
import {
  digestsPut,
  digestsQueryBySourceHash,
  digestsUpdate,
  sourcesGet,
} from "../../lib/dynamo";
import { getDigestGoal } from "../../lib/digest-goals";

const MAX_RETRIES = DIGEST_MAX_RETRIES;
const GENERATION_MODEL = process.env.GEMINI_MODEL ?? GEMINI_MODEL_ID;
// Gemini generateText output is more verbose than flat blocks; 4096 is tight.
const MAX_TOKENS = DIGEST_MAX_TOKENS;

const secretsClient = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});
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

interface WorkerEvent {
  digestId: string;
  sourceHash: string;
  digestGoal: string;
  modifiers: Record<string, unknown>;
}

type HandlerResult = { statusCode: number; headers: Record<string, string>; body: string };

/** Worker Lambda — runs the actual Gemini generation, invoked async by `handler` below. Not exposed via API Gateway. */
export async function workerHandler(event: WorkerEvent): Promise<void> {
  await runGeneration(event);
}

/** HTTP-facing Lambda — POST /digests via API Gateway. */
export async function handler(event: any): Promise<HandlerResult> {
  if (event.body === undefined) return { statusCode: 200, headers: corsHeaders, body: "" };

  let body: any;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const sourceHash = body.sourceHash;
  const digestGoal = body.digestGoal;
  const modifiers = body.modifiers ?? {};

  if (!sourceHash) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash required" }) };
  if (!digestGoal) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "digestGoal required" }) };
  }

  try {
    getDigestGoal(digestGoal);
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
      modifiers,
      paramsVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const workerEvent: WorkerEvent = { digestId, sourceHash, digestGoal, modifiers };
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.GENERATE_DIGEST_WORKER_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify(workerEvent),
      })
    );

    return { statusCode: 202, headers: corsHeaders, body: JSON.stringify({ digestId, status: "pending" }) };
  } catch (err) {
    console.error("Generate digest failed:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Internal server error" }) };
  }
}

/** Runs the actual Gemini generation and writes the result. Invoked async from `handler`. */
async function runGeneration({ digestId, sourceHash, digestGoal, modifiers }: WorkerEvent): Promise<void> {
  const now = new Date().toISOString();

  try {
    const goalConfig = getDigestGoal(digestGoal);

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
      return;
    }

    await digestsUpdate(digestId, "SET #s = :status, #u = :u", {
      ":status": "generating",
      ":u": now,
      "#s": "status",
      "#u": "updatedAt",
    });

    // Assemble prompt
    const modifierHints = Object.entries(modifiers ?? {})
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");

    // catalog.prompt() describes all 20 block types, their props, and when to
    // use each, and its default mode ("standalone") already instructs the
    // model to output JSONL RFC 6902 patches — json-render's native format.
    // We use that format directly (via generateText + compileSpecStream)
    // instead of fighting it with a structured-output schema: Gemini's
    // constrained decoding can't represent Spec.elements' dynamic keys
    // (a Record) in strict JSON Schema, so generateObject could only ever
    // produce an empty elements map.
    const catalogPrompt = catalog.prompt({
      customRules: [
        'Use "SectionContainer" as the root element.',
        "Content types: Callout, Card, ChecklistItem, CodeBlock, FaqItem, Figure, GlossaryTerm, " +
        "Grid, LinkItem, List, NextSteps, Prerequisites, Prose, ProsCons, QuoteBlock, " +
        "SectionContainer, StatCard, Step, Terminal, TLDR.",
        "Use sequential keys (el-0, el-1, ...) for content. Provide REAL props, never empty {}.",
      ],
    });

    const systemPrompt = [
      goalConfig.promptTemplate,
      modifierHints ? `Modifiers: ${modifierHints}` : "",
      catalogPrompt,
    ].filter(Boolean).join("\n");

    // Generate with retries — generateText + compileSpecStream turns the
    // model's JSONL patch stream into a Spec, then validateDigestSpec
    // enforces structure + per-type props.
    const google = await getGoogleProvider();
    let spec: Spec | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      try {
        const result = await generateText({
          model: google(GENERATION_MODEL),
          system: systemPrompt,
          prompt: `Content:\n${content}`,
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
        });

        const compiled = compileSpecStream(result.text, { root: "", elements: {} }) as unknown as Spec;
        const { spec: parsedSpec } = autoFixSpec(compiled);

        // catalog.validate() requires `visible` on every element; the
        // model sometimes omits it. Default it so validation reflects real
        // per-type prop issues, not this.
        for (const element of Object.values(parsedSpec.elements)) {
          if ((element as any).visible === undefined) {
            (element as any).visible = true;
          }
        }

        // Auto-wrap: if root element is not SectionContainer, wrap the
        // existing root under a new SectionContainer root. Only the old
        // root becomes a child — the rest of the tree already hangs off it,
        // so referencing every element key here would give some elements
        // two parents and break the tree structure.
        const oldRoot = parsedSpec.root;
        const firstType = parsedSpec.elements[oldRoot]?.type;
        if (firstType !== "SectionContainer" && Object.keys(parsedSpec.elements).length > 0) {
          const containerKey = "container";
          parsedSpec.elements[containerKey] = {
            type: "SectionContainer",
            props: {},
            children: [oldRoot],
            visible: true,
          };
          parsedSpec.root = containerKey;
        }

        // Validate structure (catalog) + per-type props
        const validation = validateDigestSpec(parsedSpec);
        if (validation.valid) {
          spec = parsedSpec;
          console.log(`Attempt ${attempt}: Spec valid, ${Object.keys(parsedSpec.elements).length} elements`);
          break;
        } else {
          console.warn(`Attempt ${attempt} validation failed:`, validation.issues.slice(0, 5).join("; "));
        }
      } catch (err) {
        console.error(`Attempt ${attempt} failed:`, err);
      }
    }

    if (!spec) {
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
      return;
    }

    // Save result — store the compiled Spec (not flat blocks)
    await digestsUpdate(digestId, "SET #s = :status, #o = :output, #m = :model, #ca = :at, #u = :u", {
      ":status": "done",
      ":output": spec,
      ":model": GENERATION_MODEL,
      ":at": now,
      ":u": now,
      "#s": "status",
      "#o": "output",
      "#m": "model",
      "#ca": "completedAt",
      "#u": "updatedAt",
    });
  } catch (err) {
    console.error("Digest generation failed:", err);
    await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
      ":status": "failed",
      ":err": "Internal error during generation",
      ":model": GENERATION_MODEL,
      ":at": now,
      "#s": "status",
      "#e": "error",
      "#m": "model",
      "#ca": "completedAt",
    }).catch((updateErr) => console.error("Failed to record generation failure:", updateErr));
  }
}
