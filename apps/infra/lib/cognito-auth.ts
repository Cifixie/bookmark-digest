/**
 * Cognito authentication for the ingestion CLI.
 *
 * The CLI POSTs to `/sources`, which is behind the Cognito user-pool
 * authorizer (see `apps/infra/lambdas/ingest-url/handler.ts`). This module
 * logs in with email/password against the dedicated CLI client, caches the
 * resulting token under `~/.config/bookmark-digest/`, and refreshes it
 * silently — so `push-source create` never asks for credentials for the token's
 * lifetime.
 *
 * Config (env, from `cdk outputs`):
 *   BKDG_CLIENT_ID       CLI client id (CfnOutput: CliUserPoolClientId)
 *   BKDG_REGION          region (default: eu-north-1)
 *   BKDG_EMAIL           optional — cached email, or supplied when re-authing
 *   BKDG_PASSWORD        optional — avoids the interactive password prompt
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  type InitiateAuthResponse,
} from "@aws-sdk/client-cognito-identity-provider";
import { existsSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

const CACHE_DIR = path.join(os.homedir(), ".config", "bookmark-digest");
const CACHE_PATH = path.join(CACHE_DIR, "cognito-token.json");

/** Refresh the cached token this long before it actually expires, with margin. */
const REUSE_SKEW_MS = 5 * 60 * 1000;

interface TokenCache {
  email: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms at which the cached ID token expires. */
  expiresAt: number;
}

export interface CognitoConfig {
  clientId: string;
  region: string;
}

export interface Credential {
  email: string;
  idToken: string;
  /** True when the token came from the local cache, not a fresh login. */
  cached: boolean;
}

export function loadCognitoConfig(): CognitoConfig {
  const clientId = process.env.BKDG_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "BKDG_CLIENT_ID not set. Get it from `cdk outputs` (CliUserPoolClientId), or set it to " +
        "the CLI client's Cognito user-pool client ID.",
    );
  }
  return { clientId, region: process.env.BKDG_REGION ?? "eu-north-1" };
}

// --- Local token cache -------------------------------------------------------

function readCache(): TokenCache | null {
  if (!existsSync(CACHE_PATH)) return null;
  const parsed: Record<string, unknown> = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  if (
    typeof parsed.email === "string" &&
    typeof parsed.idToken === "string" &&
    typeof parsed.refreshToken === "string" &&
    typeof parsed.expiresAt === "number"
  ) {
    return {
      email: parsed.email,
      idToken: parsed.idToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  }
  return null;
}

function writeCache(cache: TokenCache): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  // Mode 0600 keeps the JWT out of group/other views; chmod after write so the
  // guard holds even if the file already existed with looser perms.
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), { mode: 0o600 });
  chmodSync(CACHE_PATH, 0o600);
}

function clearCache(): void {
  if (existsSync(CACHE_PATH)) rmSync(CACHE_PATH);
}

function isTokenFresh(cache: TokenCache, now = Date.now()): boolean {
  return now < cache.expiresAt - REUSE_SKEW_MS;
}

// --- Cognito RPC ---------------------------------------------------------------

interface LoginResult {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function initiateAuth(
  config: CognitoConfig,
  authFlow: "USER_PASSWORD_AUTH" | "REFRESH_TOKEN_AUTH",
  username: string,
  secret: string,
): Promise<InitiateAuthResponse> {
  const client = new CognitoIdentityProviderClient({ region: config.region });
  const command = new InitiateAuthCommand({
    ClientId: config.clientId,
    AuthFlow: authFlow,
    AuthParameters:
      authFlow === "USER_PASSWORD_AUTH"
        ? { USERNAME: username, PASSWORD: secret }
        : { REFRESH_TOKEN: secret },
  });
  return client.send(command);
}

function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

async function loginWithPassword(
  config: CognitoConfig,
  email: string,
  password: string,
): Promise<LoginResult> {
  const response = await initiateAuth(config, "USER_PASSWORD_AUTH", email, password);
  if (response.ChallengeName) {
    throw new Error(
      `Cognito requires a ${response.ChallengeName} challenge before sign-in; the CLI cannot ` +
        "complete it (MFA is not supported). Log in from the web app instead.",
    );
  }
  const idToken = response.AuthenticationResult?.IdToken;
  const refreshToken = response.AuthenticationResult?.RefreshToken;
  if (!idToken || !refreshToken) {
    throw new Error("Cognito did not return an ID/refresh token pair.");
  }
  const expiresAt = jwtExpiryMs(idToken) ?? Date.now() + (response.AuthenticationResult?.ExpiresIn ?? 3600) * 1000;
  return { idToken, refreshToken, expiresAt };
}

async function refresh(config: CognitoConfig, refreshToken: string): Promise<LoginResult | null> {
  const response = await initiateAuth(config, "REFRESH_TOKEN_AUTH", "", refreshToken);
  const idToken = response.AuthenticationResult?.IdToken;
  if (!idToken) return null;
  const expiresAt = jwtExpiryMs(idToken) ?? Date.now() + (response.AuthenticationResult?.ExpiresIn ?? 3600) * 1000;
  return { idToken, refreshToken, expiresAt };
}

// --- Interactive prompting -----------------------------------------------------

function ask(promptText: string): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(promptText, (answer) => {
    rl.close();
    resolve(answer.trim());
  });
  return promise;
}

async function askMasked(promptText: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // No interactive terminal to mask against — read one line from stdin.
    return ask(promptText);
  }
  const { promise, resolve } = Promise.withResolvers<string>();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let value = "";
  const onData = (chunk: string): void => {
    for (const ch of chunk) {
      if (ch === "\r" || ch === "\n") {
        process.stdin.pause();
        process.stdin.setRawMode(false);
        process.stdin.off("data", onData);
        rl.close();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (ch === "\u0003") {
        process.stdin.pause();
        process.stdin.setRawMode(false);
        process.stdin.off("data", onData);
        rl.close();
        process.exit(130);
        return;
      }
      if (ch === "\u0008" || ch === "\b") {
        if (value.length > 0) value = value.slice(0, -1);
      } else {
        value += ch;
      }
    }
  };
  process.stdin.on("data", onData);
  return promise;
}

async function promptPassword(): Promise<string> {
  const env = process.env.BKDG_PASSWORD;
  if (env) return env;
  const answer = await askMasked("Cognito password: ");
  if (!answer) throw new Error("No password provided.");
  return answer;
}

// --- Public entry point --------------------------------------------------------

/**
 * Resolves a usable ID token, reusing or refreshing the local cache and only
 * prompting for credentials when the cache can't produce one. `forceLogin`
 * skips both cache reads and drives a fresh email/password login.
 */
export async function getCredential(
  config: CognitoConfig,
  options: { forceLogin?: boolean } = {},
): Promise<Credential> {
  const cached = readCache();

  // 1. Fresh cached token — no credentials needed.
  if (!options.forceLogin && cached && isTokenFresh(cached)) {
    return { email: cached.email, idToken: cached.idToken, cached: true };
  }

  // 2. Refresh silently with the cached refresh token.
  if (!options.forceLogin && cached?.refreshToken) {
    const refreshed = await refresh(config, cached.refreshToken);
    if (refreshed) {
      writeCache({ email: cached.email, ...refreshed });
      return { email: cached.email, idToken: refreshed.idToken, cached: true };
    }
    // Corrupt/expired refresh token: drop it and fall through to a login.
    clearCache();
  }

  // 3. Password login. Email is pulled from env or cache, so only the password
  //    is ever prompted for on a login that needs one.
  const email = process.env.BKDG_EMAIL ?? cached?.email;
  if (!email) {
    const answer = await ask("Cognito email: ");
    if (!answer) throw new Error("No email provided.");
  }
  const password = await promptPassword();
  const result = await loginWithPassword(config, email!, password);
  writeCache({ email: email!, idToken: result.idToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt });
  return { email: email!, idToken: result.idToken, cached: false };
}

/** Explicit login — forces a fresh email/password sign-in and stores the token. */
export function login(config: CognitoConfig): Promise<Credential> {
  return getCredential(config, { forceLogin: true });
}

export function logout(): void {
  clearCache();
}
