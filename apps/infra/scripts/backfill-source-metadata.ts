#!/usr/bin/env -S npx tsx
/**
 * Backfill title/description/ogImage/siteName for sources ingested before
 * ingest-url started capturing Firecrawl's page metadata. Re-fetches each
 * source's URL via Firecrawl for metadata only — `content` (the row's
 * primary key, via its sha256 hash) is never touched or overwritten.
 *
 * Only touches sources missing `description` (the idempotency signal — safe
 * to re-run after a partial failure). Skips `status: "failed"` sources, since
 * those failed to fetch for a reason a metadata-only re-fetch won't fix.
 *
 * Usage:
 *   npx tsx scripts/backfill-source-metadata.ts --dry-run   # list candidates, no Firecrawl calls, no writes
 *   npx tsx scripts/backfill-source-metadata.ts             # fetch + write for real
 *
 * Requires the same env vars the deployed Lambdas use: SOURCES_TABLE_NAME,
 * FIRECRAWL_API_KEY, AWS credentials for the target account/region.
 */

import { sourcesScan, sourcesUpdate } from "../lib/dynamo";
import { FIRECRAWL_API_URL } from "../lib/config";

const DELAY_MS = 1200; // spacing between Firecrawl calls
const MAX_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ScrapedMetadata {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  siteName: string | null;
}

async function fetchMetadata(url: string): Promise<ScrapedMetadata | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      // Firecrawl always returns markdown alongside metadata; we discard the
      // markdown here since content is not being touched.
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterSec = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 2000 * 2 ** attempt;
      console.log(`  rate limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      console.error(`  Firecrawl returned ${res.status} for ${url}`);
      return null;
    }

    const data: any = await res.json();
    if (!data.success) return null;

    return {
      title: data.data?.metadata?.title ?? null,
      description: data.data?.metadata?.description ?? null,
      ogImage: data.data?.metadata?.ogImage ?? null,
      siteName: data.data?.metadata?.ogSiteName ?? null,
    };
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { Items } = await sourcesScan(
    "attribute_not_exists(description) AND #s <> :failed",
    { ":failed": "failed", "#s": "status", "#u": "url" },
    "contentHash, #s, #u"
  );
  const candidates = Items as Array<{ contentHash: string; status: string; url: string }>;

  console.log(`Found ${candidates.length} source(s) missing description (status != failed).`);
  if (dryRun) {
    for (const c of candidates) console.log(`  [dry-run] ${c.contentHash.slice(0, 12)}  ${c.url}`);
    console.log("Dry run — no Firecrawl calls made, no writes performed.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, c] of candidates.entries()) {
    console.log(`[${i + 1}/${candidates.length}] ${c.url}`);
    try {
      const meta = await fetchMetadata(c.url);
      if (!meta) {
        console.log("  no metadata returned — skipping");
        skipped++;
        continue;
      }

      // sourcesUpdate always sends ExpressionAttributeNames, even when empty,
      // which DynamoDB rejects — so every field here gets a "#"-aliased name
      // to guarantee the map is never empty, regardless of which fields are set.
      const sets: string[] = [];
      const attrs: Record<string, unknown> = {};
      if (meta.title) { sets.push("#title = :title"); attrs[":title"] = meta.title; attrs["#title"] = "title"; }
      if (meta.description) { sets.push("#description = :description"); attrs[":description"] = meta.description; attrs["#description"] = "description"; }
      if (meta.ogImage) { sets.push("#ogImage = :ogImage"); attrs[":ogImage"] = meta.ogImage; attrs["#ogImage"] = "ogImage"; }
      if (meta.siteName) { sets.push("#siteName = :siteName"); attrs[":siteName"] = meta.siteName; attrs["#siteName"] = "siteName"; }

      if (sets.length === 0) {
        console.log("  Firecrawl returned no usable metadata fields — skipping");
        skipped++;
        continue;
      }

      await sourcesUpdate(c.contentHash, `SET ${sets.join(", ")}`, attrs);
      console.log(`  updated: ${sets.map((s) => s.split(" ")[0]).join(", ")}`);
      updated++;
    } catch (err) {
      console.error(`  failed:`, err);
      failed++;
    }

    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
}

main();
