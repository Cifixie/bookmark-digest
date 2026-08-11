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
import customRules from "./customRules";

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
  if (!(err instanceof Error)) return false;
  // The AI SDK retries transient failures and wraps the underlying cause in
  // a RetryError, whose top-level .message doesn't include "429" or
  // "RESOURCE_EXHAUSTED" — those only appear on the nested per-attempt
  // errors (err.errors[]). Check both levels.
  const pattern = /RESOURCE_EXHAUSTED|429|quota exceeded/i;
  if (pattern.test(err.message)) return true;
  const nested = (err as { errors?: unknown[] }).errors;
  return Array.isArray(nested) && nested.some((e) => {
    if (typeof e !== "object" || e === null) return false;
    const { statusCode, message } = e as { statusCode?: number; message?: string };
    return statusCode === 429 || (typeof message === "string" && pattern.test(message));
  });
}

// --- Lambda handler ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

interface WorkerEvent {
  digestId: string;
  sourceHashes: string[];
  digestGoal: string;
  multiSource?: boolean;
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
  const sourceHashes = body.sourceHashes;
  const digestGoal = body.digestGoal;

  // Accept either single-source (sourceHash) or multi-source (sourceHashes)
  // Multi-source takes precedence; falls back to legacy format for backward compat.
  let hashes: string[];
  if (sourceHashes && Array.isArray(sourceHashes) && sourceHashes.length > 0) {
    hashes = sourceHashes;
  } else if (sourceHash) {
    hashes = [sourceHash];
  } else {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash or sourceHashes required" }) };
  }

  const multiSource = sourceHashes && Array.isArray(sourceHashes) && sourceHashes.length > 1;
  if (!digestGoal) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "digestGoal required" }) };
  }

  try {
    getDigestGoal(digestGoal);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Invalid digestGoal: ${digestGoal}` }) };
  }

  try {
    // Dedup check — multi-source digests can't use the GSI (sourceHash is scalar),
    // so we scan matching rows and compare sourceHashes arrays.
    const existingResult = await digestsQueryBySourceHash(hashes[0], digestGoal);
    const existingItems = existingResult?.Items as any[] | undefined;
    const existingPending = existingItems?.find((item: any) => {
      if (item.status !== "pending" && item.status !== "generating") return false;
      if (multiSource) {
        // Compare full sourceHashes array for multi-source digests
        const existingHashes: string[] = item.sourceHashes;
        if (!existingHashes || existingHashes.length !== hashes.length) return false;
        return hashes.every((h) => existingHashes.includes(h));
      }
      // Single-source: GSI-level match is sufficient
      return item.sourceHash === hashes[0];
    });

    if (existingPending) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ digestId: existingPending.id, status: "accepted" }) };
    }

    // Create new digest row
    const digestId = randomUUID();
    const now = new Date().toISOString();
    const paramsVersion = `catalog@${process.env.CATALOG_VERSION ?? "0.0.0"}-goals@${digestGoal}`;

    await digestsPut({
      id: digestId,
      sourceHash: hashes[0],
      sourceHashes: hashes,
      digestGoal,
      paramsVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const workerEvent: WorkerEvent = { digestId, sourceHashes: hashes, digestGoal, multiSource };
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
async function runGeneration({ digestId, sourceHashes, digestGoal, multiSource }: WorkerEvent): Promise<void> {
  const now = new Date().toISOString();

  try {
    const goalConfig = getDigestGoal(digestGoal);

    // Fetch content from all sources
    const sourceResults = await Promise.all(
      sourceHashes.map(async (hash) => {
        const result = await sourcesGet(hash);
        const item = result?.Item as any;
        return { hash, content: item?.content ?? null, url: item?.url ?? "", fetchedAt: item?.fetchedAt ?? "" };
      }),
    );

    // Check that all sources have content
    const missing = sourceResults.filter((r) => !r.content);
    if (missing.length > 0) {
      await digestsUpdate(digestId, "SET #s = :status, #e = :err, #m = :model, #ca = :at", {
        ":status": "failed",
        ":err": `${missing.length} of ${sourceHashes.length} sources missing content`,
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
    const catalogPrompt = catalog.prompt({ customRules });

    const systemPrompt = [goalConfig.promptTemplate, catalogPrompt].filter(Boolean).join("\n");

    // Build the content prompt — single or multi-source.
    // Multi-source digests instruct the model to compare/synthesize across
    // sources and attribute claims back to their origin.
    let contentPrompt: string;
    if (multiSource) {
      const sourcesSection = sourceResults
        .map(
          (r, i) =>
            `--- Source ${i + 1} ---\nURL: ${r.url}\nFetched: ${r.fetchedAt}\nContent:\n${r.content}`,
        )
        .join("\n\n");
      contentPrompt = `You are synthesizing a digest from ${sourceHashes.length} distinct sources on the same topic. Compare, contrast, and synthesize the information across all sources.

When presenting findings, be specific about which source each claim comes from. Use AuthorCard blocks to attribute specific claims, quotes, or findings to individual sources. Use ComparisonTable when the sources offer comparable data (product specs, ratings, metrics, trade-offs).

${sourcesSection}`;
    } else {
      contentPrompt = `Content:\n${sourceResults[0].content}`;
    }

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
        prompt: contentPrompt,
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.3,
      });
    } catch (err) {
      if (!isQuotaExceeded(err)) {
        console.error(`Gemini request failed for ${digestId}:`, err);
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

      console.warn(`Gemini quota exceeded for ${digestId}, falling back to Bedrock`);
      usedModel = FALLBACK_MODEL;
      try {
        result = await generateText({
          model: bedrock(FALLBACK_MODEL),
          system: systemPrompt,
          prompt: contentPrompt,
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
        });
      } catch (fallbackErr) {
        console.error(`Bedrock fallback also failed for ${digestId}:`, fallbackErr);
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
      console.warn(`Validation failed for ${digestId}: ${err}`);
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
    console.error(`Generation failed for ${digestId}:`, err);
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
