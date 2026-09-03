/**
 * Loads the deployed CDK stack outputs from `apps/infra/outputs.json`, the
 * single source of truth for the local dev CLIs.
 *
 * This file is git-ignored and never shipped — regenerate it after any deploy
 * with `pnpm outputs` (which runs `cdk deploy --outputs-file outputs.json`
 * from this package) instead of editing it by hand.
 *
 * Reading it at runtime (rather than `import`ing the JSON) keeps the loader
 * working before the first deploy has run and avoids pulling an untracked file
 * into the compiled assembly.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_PATH = resolve(HERE, "..", "..", "..", "apps", "infra", "outputs.json");

/** Known keys of `apps/infra/outputs.json`'s `BookmarkDigest` block. */
export interface StackOutputs {
  UserPoolClientId?: string;
  CliUserPoolClientId?: string;
  ApiUrl?: string;
  UserPoolId?: string;
  WebUrl?: string;
  SourcesTableName?: string;
  DigestsTableName?: string;
  TagsTableName?: string;
}

/** Reads and parses `apps/infra/outputs.json`. Throws with a path if missing. */
export function loadStackOutputs(): StackOutputs {
  try {
    const raw = JSON.parse(readFileSync(OUTPUTS_PATH, "utf8")) as {
      BookmarkDigest: StackOutputs;
    };
    return raw.BookmarkDigest ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read stack outputs from ${OUTPUTS_PATH}: ${message}`);
  }
}

/** The CLI's dedicated Cognito client id (cdk: CliUserPoolClientId). */
export function cliClientId(outputs: StackOutputs = loadStackOutputs()): string {
  const clientId = outputs.CliUserPoolClientId;
  if (!clientId) {
    throw new Error(
      "CliUserPoolClientId missing from outputs.json. Run `pnpm outputs` to regenerate it.",
    );
  }
  return clientId;
}

/** The API Gateway base URL (cdk: ApiUrl). */
export function apiBaseUrl(outputs: StackOutputs = loadStackOutputs()): string {
  const url = outputs.ApiUrl;
  if (!url) {
    throw new Error("ApiUrl missing from outputs.json. Run `pnpm outputs` to regenerate it.");
  }
  return url;
}

/**
 * Region, derived from the UserPoolId (`eu-north-1_...`). Falls back to the
 * stack's home region only when the pool id is absent.
 */
export function stackRegion(outputs: StackOutputs = loadStackOutputs()): string {
  const poolId = outputs.UserPoolId;
  if (poolId && poolId.includes("_")) return poolId.slice(0, poolId.indexOf("_"));
  return "eu-north-1";
}
