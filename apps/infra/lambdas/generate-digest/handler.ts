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
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { compileSpecStream, autoFixSpec, type Spec } from "@json-render/core";
import { validateDigestSpec, catalog } from "@bookmark-digest/catalog";
import { randomUUID } from "crypto";
import { GEMINI_MODEL_ID, DIGEST_MAX_TOKENS, BEDROCK_HAIKU_INFERENCE_PROFILE_ID } from "../../lib/config";
import {
  digestsPut,
  digestsQueryBySourceHash,
  digestsUpdate,
  sourcesGet,
} from "../../lib/dynamo";
import { getDigestGoal } from "../../lib/digest-goals";

const GENERATION_MODEL = process.env.GEMINI_MODEL ?? GEMINI_MODEL_ID;
const FALLBACK_MODEL = process.env.BEDROCK_HAIKU_INFERENCE_PROFILE_ID ?? BEDROCK_HAIKU_INFERENCE_PROFILE_ID;
const MAX_TOKENS = DIGEST_MAX_TOKENS;
// Below this, a spec is a stub (e.g. root + one Prose block), not a digest.
const MIN_ELEMENTS = 3;

const secretsClient = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});
const bedrock = createAmazonBedrock({});
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

function isQuotaExceeded(err: unknown): boolean {
  return err instanceof Error && /RESOURCE_EXHAUSTED|429/.test(err.message);
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
      paramsVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const workerEvent: WorkerEvent = { digestId, sourceHash, digestGoal };
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
async function runGeneration({ digestId, sourceHash, digestGoal }: WorkerEvent): Promise<void> {
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
    // catalog.prompt() already describes all 20 block types, their props,
    // and when to use each, so customRules only needs to cover what it
    // doesn't: the root element, key naming, and disabling the dynamic
    // state-binding features (repeat, $state, $item, $bindState, $template)
    // that catalog.prompt() teaches for interactive apps. A digest is
    // static one-shot output with no state model, but the model isn't told
    // that — left unsaid, it reaches for those patterns (its own first
    // example shows title: {"$item":"title"}) and emits objects where a
    // plain string prop is expected.
    const catalogPrompt = catalog.prompt({
      customRules: [
        'Use "SectionContainer" as the root element.',
        "Use sequential keys (el-0, el-1, ...). Provide REAL props, never empty {}.",
        "This is static one-shot content, not an interactive app: there is no state model. " +
          "Do NOT use \"repeat\", \"state\", or dynamic prop expressions " +
          "({\"$state\":...}, {\"$item\":...}, {\"$bindState\":...}, {\"$template\":...}, {\"$cond\":...}). " +
          "Every prop value must be a literal string, number, boolean, or array — write out each " +
          "repeated item (e.g. each Card, Step, GlossaryTerm) as its own element instead.",
        "Every key referenced in a children array must exist as its own element in the output.",
      ],
    });

    const systemPrompt = [goalConfig.promptTemplate, catalogPrompt].filter(Boolean).join("\n");

    // Single attempt per model — generateText + compileSpecStream turns the
    // model's JSONL patch stream into a Spec, then validateDigestSpec
    // enforces structure + per-type props. The free-tier Gemini quota is
    // scarce enough (20 requests/day/model) that retrying a failed attempt
    // just burns quota faster without fixing whatever made it fail; a
    // failure is surfaced directly rather than papered over. The one
    // exception is quota exhaustion itself, which falls back to Bedrock
    // Claude Haiku rather than failing the digest outright.
    const google = await getGoogleProvider();

    let result: Awaited<ReturnType<typeof generateText>>;
    let usedModel = GENERATION_MODEL;
    try {
      result = await generateText({
        model: google(GENERATION_MODEL),
        system: systemPrompt,
        prompt: `Content:\n${content}`,
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.3,
      });
    } catch (err) {
      if (!isQuotaExceeded(err)) {
        await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
          ":status": "failed",
          ":err": "Gemini request failed",
          ":model": GENERATION_MODEL,
          ":at": now,
          "#s": "status",
          "#e": "error",
          "#m": "model",
          "#ca": "completedAt",
        });
        return;
      }

      console.warn("Gemini quota exceeded, falling back to Bedrock Claude Haiku");
      usedModel = FALLBACK_MODEL;
      try {
        result = await generateText({
          model: bedrock(FALLBACK_MODEL),
          system: systemPrompt,
          prompt: `Content:\n${content}`,
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
        });
      } catch (fallbackErr) {
        console.error("Bedrock Haiku fallback also failed:", fallbackErr);
        await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
          ":status": "failed",
          ":err": "Gemini quota exceeded and Bedrock Haiku fallback failed",
          ":model": FALLBACK_MODEL,
          ":at": now,
          "#s": "status",
          "#e": "error",
          "#m": "model",
          "#ca": "completedAt",
        });
        return;
      }
    }

    const compiled = compileSpecStream(result.text, { root: "", elements: {} }) as unknown as Spec;
    const { spec: parsedSpec } = autoFixSpec(compiled);

    for (const element of Object.values(parsedSpec.elements)) {
      const el = element as any;
      // catalog.validate() requires `visible` on every element; the model
      // sometimes omits it. Default it so validation reflects real per-type
      // prop issues, not this.
      if (el.visible === undefined) el.visible = true;
      // A container with no children, or an element the model forgot to
      // give a props object, is a benign gap — default it rather than
      // failing validation over it. A wrong-shaped value (e.g. a string
      // prop that came back as an object) is a real model/prompt bug and
      // is left to fail validation as-is.
      if (el.children === undefined) el.children = [];
      if (el.props === undefined) el.props = {};
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
    const elementCount = Object.keys(parsedSpec.elements).length;
    // Root SectionContainer + a single content element passes validation
    // but reads as a stub, not a digest. tl_dr is deliberately terse, so
    // it's exempt from this floor.
    const isThin = digestGoal !== "tl_dr" && elementCount < MIN_ELEMENTS;

    if (!validation.valid || isThin) {
      const err = isThin
        ? `Spec too thin (${elementCount} elements)`
        : `Validation failed: ${validation.issues.slice(0, 5).join("; ")}`;
      console.warn(err);
      await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
        ":status": "failed",
        ":err": err,
        ":model": usedModel,
        ":at": now,
        "#s": "status",
        "#e": "error",
        "#m": "model",
        "#ca": "completedAt",
      });
      return;
    }

    const spec = parsedSpec;

    // Save result — store the compiled Spec (not flat blocks)
    await digestsUpdate(digestId, "SET #s = :status, #o = :output, #m = :model, #ca = :at, #u = :u", {
      ":status": "done",
      ":output": spec,
      ":model": usedModel,
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
