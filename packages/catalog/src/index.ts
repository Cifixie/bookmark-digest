/**
 * Intentionally empty for Phase-0.
 *
 * This is where defineCatalog Zod schemas for Tier 1 (Structure) and
 * Tier 2 (Digest Essentials) will live. Tiers 3/4 (Comparison/Research,
 * Learn/Interactive) come post-MVP.
 *
 * Keep this package's runtime deps minimal (zod + @bookmark-digest/schemas)
 * since it will be imported by both the Next.js app and any Lambda that
 * needs to validate catalog-shaped data.
 */

export {};
