/**
 * Cross-cutting utilities shared between apps/web and apps/infra Lambdas.
 * e.g. a Bedrock client wrapper, logging helpers, env var validation.
 *
 * Keep heavy deps (AWS SDK clients, Vercel AI SDK) here rather than in
 * @bookmark-digest/schemas or @bookmark-digest/catalog, so those stay
 * lightweight and safe to bundle into any Lambda without bloat.
 */

export {};
