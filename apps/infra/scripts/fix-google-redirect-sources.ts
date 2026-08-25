#!/usr/bin/env -S npx tsx
/**
 * Fixes sources ingested from Google's `google.<tld>/url?...` search-result
 * wrapper links, from before ingest-url started resolving them (see
 * lib/resolve-url.ts). Two distinct problems, handled differently:
 *
 *  - "cosmetic" rows: Firecrawl actually followed the wrapper and scraped the
 *    real page, so `content` is fine — only the stored `url` field is the
 *    ugly wrapper. Fixed in place: UPDATE `url` to the resolved target. Safe,
 *    non-destructive, doesn't touch `content`/`contentHash`.
 *  - "broken" rows: `content` is Google's own redirect interstitial (title
 *    "Redirect Notice", or similarly thin), not the target page at all.
 *    Since `contentHash` is derived from `content`, fixing this means a new
 *    row, not an update. If a good copy of the same target URL already
 *    exists among this scan's sources (a wrapper for the same target was
 *    ingested more than once), the row is reported as a duplicate and left
 *    alone. Otherwise the target is fetched fresh via Firecrawl and inserted
 *    as a new source (mirroring ingest-url's own insert).
 *
 * This script never deletes or overwrites `content` on an existing row — old
 * broken rows are left in place and reported at the end for manual review,
 * since deleting them could orphan a digest's `sourceHash` reference.
 *
 * Usage:
 *   npx tsx scripts/fix-google-redirect-sources.ts --dry-run   # report only, no Firecrawl calls, no writes
 *   npx tsx scripts/fix-google-redirect-sources.ts             # apply url fixes + insert replacements for real
 */

import { createHash } from "crypto";
import { sourcesScan, sourcesQueryByUrl, sourcesUpdate, sourcesPut } from "../lib/dynamo";
import { resolveUrl } from "../lib/resolve-url";
import { FIRECRAWL_API_URL } from "../lib/config";

const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGoogleUrlWrapper(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return /^(www\.)?google\.[a-z.]+$/i.test(parsed.hostname) && parsed.pathname === "/url";
  } catch {
    return false;
  }
}

/** Heuristic for Google's own redirect interstitial page, not the target. */
function looksLikeRedirectInterstitial(content: string): boolean {
  return content.trim().startsWith("**Redirect Notice**") || /the previous page is sending you to/i.test(content);
}

interface ScrapedSource {
  content: string;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  siteName: string | null;
}

async function fetchViaFirecrawl(url: string): Promise<ScrapedSource | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const res = await fetch(FIRECRAWL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) {
    console.error(`  Firecrawl returned ${res.status} for ${url}`);
    return null;
  }

  const data: any = await res.json();
  if (!data.success || !data.data?.markdown) return null;

  return {
    content: data.data.markdown,
    title: data.data.metadata?.title ?? null,
    description: data.data.metadata?.description ?? null,
    ogImage: data.data.metadata?.ogImage ?? null,
    siteName: data.data.metadata?.ogSiteName ?? null,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { Items } = await sourcesScan(undefined, { "#u": "url" }, "contentHash, #u, content, title");
  const all = Items as Array<{ contentHash: string; url: string; content: string; title?: string }>;
  const wrapped = all.filter((s) => isGoogleUrlWrapper(s.url));

  console.log(`${wrapped.length} of ${all.length} source(s) are Google url-wrapper links.\n`);

  // Resolve + classify everything up front (no Firecrawl calls yet), so a
  // "cosmetic" row's fixed url is known before we decide whether a sibling
  // "broken" row in this same batch is a duplicate of it — otherwise the
  // broken row's dedup check (against live DB state) would miss a
  // still-wrapper-url'd sibling that's about to be fixed in this same run.
  const resolved = await Promise.all(
    wrapped.map(async (s) => ({
      ...s,
      resolvedUrl: await resolveUrl(s.url),
      broken: looksLikeRedirectInterstitial(s.content),
    }))
  );

  const goodByResolvedUrl = new Map<string, string>(); // resolvedUrl -> contentHash of a good copy
  for (const s of resolved) {
    if (!s.broken) goodByResolvedUrl.set(s.resolvedUrl, s.contentHash);
  }

  const toReviewManually: string[] = [];
  let cosmeticFixed = 0;
  let inserted = 0;
  let duplicatesSkipped = 0;
  let failed = 0;

  for (const [i, s] of resolved.entries()) {
    console.log(`[${i + 1}/${resolved.length}] ${s.contentHash.slice(0, 12)}  ${s.broken ? "BROKEN" : "cosmetic"}  -> ${s.resolvedUrl}`);

    if (!s.broken) {
      // Content is fine; just repoint the stored url at the real target.
      if (dryRun) {
        console.log(`  [dry-run] would update url -> ${s.resolvedUrl}`);
      } else {
        await sourcesUpdate(s.contentHash, "SET #u = :url", { ":url": s.resolvedUrl, "#u": "url" });
        console.log(`  updated url`);
      }
      cosmeticFixed++;
      continue;
    }

    // Broken: content is Google's own interstitial, needs a real fetch —
    // unless a good copy of the same target already exists, either among
    // this batch's cosmetic rows or elsewhere in the table already.
    const withinBatchDuplicate = goodByResolvedUrl.get(s.resolvedUrl);
    const existing = withinBatchDuplicate ? undefined : await sourcesQueryByUrl(s.resolvedUrl);
    const goodDuplicate =
      withinBatchDuplicate ?? (existing?.Items ?? []).find((it: any) => it.contentHash !== s.contentHash)?.contentHash;
    if (goodDuplicate) {
      console.log(`  duplicate of ${String(goodDuplicate).slice(0, 12)} — leaving broken row in place`);
      toReviewManually.push(s.contentHash);
      duplicatesSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] would fetch ${s.resolvedUrl} via Firecrawl and insert as a new source`);
      inserted++;
      continue;
    }

    try {
      const scraped = await fetchViaFirecrawl(s.resolvedUrl);
      if (!scraped) {
        console.log(`  fetch failed — leaving broken row in place`);
        toReviewManually.push(s.contentHash);
        failed++;
        continue;
      }

      const contentHash = createHash("sha256").update(scraped.content).digest("hex");
      const now = new Date().toISOString();
      await sourcesPut(
        {
          contentHash,
          url: s.resolvedUrl,
          content: scraped.content,
          contentType: "article",
          fetchedAt: now,
          fetchedBy: "firecrawl",
          status: "embedding",
          title: scraped.title ?? undefined,
          description: scraped.description ?? undefined,
          ogImage: scraped.ogImage ?? undefined,
          siteName: scraped.siteName ?? undefined,
        },
        "attribute_not_exists(contentHash)"
      );
      console.log(`  inserted new source ${contentHash.slice(0, 12)} — old broken row ${s.contentHash.slice(0, 12)} left in place`);
      toReviewManually.push(s.contentHash);
      inserted++;
    } catch (err) {
      console.error(`  failed:`, err);
      toReviewManually.push(s.contentHash);
      failed++;
    }

    if (i < resolved.length - 1) await sleep(DELAY_MS);
  }

  console.log(
    `\nDone. cosmeticFixed=${cosmeticFixed} inserted=${inserted} duplicatesSkipped=${duplicatesSkipped} failed=${failed}`
  );
  if (toReviewManually.length > 0) {
    console.log(`\nOld broken rows left in place (safe to delete by hand once you've confirmed replacements look right):`);
    for (const h of toReviewManually) console.log(`  ${h}`);
  }
}

main();
