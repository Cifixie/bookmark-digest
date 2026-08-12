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
import {
  GEMINI_MODEL_ID,
  DIGEST_MAX_TOKENS,
  BEDROCK_HAIKU_INFERENCE_PROFILE_ID,
  MAX_SOURCES_PER_DIGEST,
  MAX_SOURCE_CHARS_MULTI,
} from "../../lib/config";
import {
  digestsPut,
  digestsQueryBySourceHash,
  digestsUpdate,
  sourcesGet,
} from "../../lib/dynamo";
import { getDigestGoal, getSourceMode, DEFAULT_SOURCE_MODE, GROUNDING_RULES } from "../../lib/digest-goals";

// Recursively deletes `null` values from objects/arrays in place. Every
// optional field in the catalog's Zod schemas is `.optional()`, not
// `.nullable()`, so an explicit `null` (a common model habit) fails
// validation where simply omitting the key would not.
function stripNulls(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripNulls(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null) {
      delete (value as Record<string, unknown>)[key];
    } else {
      stripNulls(v);
    }
  }
}
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
  /** How the sources relate; only meaningful when multiSource. */
  sourceMode?: string;
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

  // Accept either single-source (sourceHash) or multi-source (sourceHashes).
  // Multi-source takes precedence; falls back to legacy format for backward compat.
  let requested: unknown[];
  if (Array.isArray(sourceHashes) && sourceHashes.length > 0) {
    requested = sourceHashes;
  } else if (sourceHash) {
    requested = [sourceHash];
  } else {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHash or sourceHashes required" }) };
  }

  if (!requested.every((h): h is string => typeof h === "string" && h.length > 0)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "sourceHashes must be non-empty strings" }) };
  }

  // Deduplicate and sort. Both matter for the dedup check below: the stored
  // `sourceHash` (hashes[0]) is the GSI partition key we look existing digests
  // up by, so {A,B} and {B,A} have to normalize to the same first element or
  // the same bundle generates twice. Sorting also makes the array comparison
  // an equality check rather than a subset test.
  const hashes = [...new Set(requested as string[])].sort();

  if (hashes.length > MAX_SOURCES_PER_DIGEST) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: `At most ${MAX_SOURCES_PER_DIGEST} sources per digest (got ${hashes.length})` }),
    };
  }

  const multiSource = hashes.length > 1;
  // How the sources relate to each other — orthogonal to digestGoal, which
  // covers depth and voice. Only meaningful for a bundle.
  const sourceMode = multiSource ? (body.sourceMode ?? DEFAULT_SOURCE_MODE) : undefined;
  if (!digestGoal) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "digestGoal required" }) };
  }

  try {
    getDigestGoal(digestGoal);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Invalid digestGoal: ${digestGoal}` }) };
  }

  if (sourceMode !== undefined) {
    try {
      getSourceMode(sourceMode);
    } catch {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Invalid sourceMode: ${sourceMode}` }) };
    }
  }

  try {
    // Dedup check — the GSI is keyed on the scalar `sourceHash`, which for a
    // multi-source digest is only the first of its hashes, so the GSI narrows
    // the candidates and the full (normalized, sorted) array decides.
    const existingResult = await digestsQueryBySourceHash(hashes[0], digestGoal);
    const existingItems = existingResult?.Items as any[] | undefined;
    const existingPending = existingItems?.find((item: any) => {
      if (item.status !== "pending" && item.status !== "generating") return false;
      if (multiSource) {
        const existingHashes: string[] = item.sourceHashes;
        if (!Array.isArray(existingHashes) || existingHashes.length !== hashes.length) return false;
        // Same sources + goal but a different mode is a different digest,
        // not a duplicate — comparing and synthesizing a bundle are both
        // legitimate outputs to want.
        if ((item.sourceMode ?? DEFAULT_SOURCE_MODE) !== sourceMode) return false;
        return hashes.every((h, i) => existingHashes[i] === h);
      }
      // Single-source: a legacy row may predate `sourceHashes` entirely, so
      // match on the scalar and require it not be part of a bundle.
      return item.sourceHash === hashes[0] && (item.sourceHashes?.length ?? 1) === 1;
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
      sourceMode,
      digestGoal,
      paramsVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const workerEvent: WorkerEvent = { digestId, sourceHashes: hashes, digestGoal, multiSource, sourceMode };
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
async function runGeneration({ digestId, sourceHashes, digestGoal, multiSource, sourceMode }: WorkerEvent): Promise<void> {
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

    // The goal template sets depth and voice; the source-mode template (multi
    // only) sets page composition across sources and so comes after it, since
    // the goal templates are written in the singular ("let the article's
    // structure drive the page structure") and would otherwise pull the model
    // toward a single-source shape. Composition guidance lives here in the
    // system prompt, not in the user turn alongside the content — putting the
    // two in different turns is what previously let "compare and contrast"
    // fight the goal's own instructions, and comparison won regardless of
    // whether the sources were actually in competition.
    //
    // GROUNDING_RULES comes last of the three prose blocks because it has to
    // outrank both: the goal template asks for thoroughness ("capture enough
    // detail that a beginner could learn the full substance") and the mode
    // template asks for a particular page shape, and a model with inadequate
    // material will satisfy either by inventing content. The grounding block
    // is what makes "the material doesn't support this" an acceptable answer.
    const modeTemplate = multiSource && sourceMode ? getSourceMode(sourceMode).promptTemplate : "";
    const systemPrompt = [goalConfig.promptTemplate, modeTemplate, GROUNDING_RULES, catalogPrompt]
      .filter(Boolean)
      .join("\n");

    // The user turn carries only the material — no shape instructions.
    let contentPrompt: string;
    if (multiSource) {
      const sourcesSection = sourceResults
        .map((r, i) => {
          const content = r.content as string;
          // Truncate per source rather than dropping whole sources: every
          // mode needs all N present, and the opening of an article carries
          // most of its thesis.
          const clipped =
            content.length > MAX_SOURCE_CHARS_MULTI
              ? `${content.slice(0, MAX_SOURCE_CHARS_MULTI)}\n[…source truncated at ${MAX_SOURCE_CHARS_MULTI} characters]`
              : content;
          return `--- Source ${i + 1} ---\nURL: ${r.url}\nFetched: ${r.fetchedAt}\nContent:\n${clipped}`;
        })
        .join("\n\n");
      contentPrompt = `The following ${sourceHashes.length} sources are the material for this digest.\n\n${sourcesSection}`;
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

    // `finishReason: "length"` means the model was cut off mid-stream, which
    // shows up downstream as a structurally broken spec (a container whose
    // children were emitted before the children themselves). Log it up front
    // so that cause is distinguishable from the model simply getting it wrong
    // — multi-source prompts are large enough to make this a live risk.
    console.info(
      `Generation for ${digestId}: model=${usedModel} finishReason=${result.finishReason} ` +
        `inputTokens=${result.usage?.inputTokens} outputTokens=${result.usage?.outputTokens}`
    );

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
      // The model sometimes emits `null` for an omitted optional field
      // instead of leaving the key out (e.g. ComparisonTable rows without
      // a winner). Zod schemas here use `.optional()`, not `.nullable()`,
      // so an explicit null fails validation even though omitting the key
      // entirely would have been fine. Strip nulls to normalize both forms.
      stripNulls(el.props);
    }

    // Drop child references pointing at elements that were never emitted.
    // autoFixSpec doesn't do this (it only relocates misplaced element-level
    // keys), so a single dangling reference otherwise fails the whole digest
    // — and each failure costs one of the day's scarce free-tier requests.
    // Same policy as the benign gaps above: repair the structure, keep the
    // digest, and log what was lost. The MIN_ELEMENTS floor below still
    // catches the case where pruning leaves nothing worth showing.
    const droppedRefs: string[] = [];
    for (const [key, element] of Object.entries(parsedSpec.elements)) {
      const el = element as any;
      if (!Array.isArray(el.children)) continue;
      const kept = el.children.filter((child: unknown) => typeof child === "string" && child in parsedSpec.elements);
      if (kept.length !== el.children.length) {
        for (const child of el.children) {
          if (!kept.includes(child)) droppedRefs.push(`${key}→${String(child)}`);
        }
        el.children = kept;
      }
    }
    if (droppedRefs.length > 0) {
      console.warn(
        `Pruned ${droppedRefs.length} dangling child reference(s) for ${digestId}: ${droppedRefs.join(", ")}. ` +
          `The model referenced blocks it never emitted; the digest is missing that content.`
      );
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
      // A failed generation has already spent a request against a 20/day
      // quota. Without the raw output there's nothing left to diagnose it
      // with, so log a bounded prefix rather than re-running to reproduce.
      console.warn(
        `Raw model output for ${digestId} (first 4000 chars of ${result.text.length}):\n${result.text.slice(0, 4000)}`
      );
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
