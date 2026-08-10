/**
 * check-embed-failures Lambda — daily scheduled check for stuck/embedding failures.
 *
 * Scans the Sources table for `status = "failed"` items older than 1 hour.
 * If any are found, publishes an SNS alert with the count and source URLs.
 *
 * Triggered daily at 06:00 UTC via EventBridge cron rule.
 */

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { sourcesScan } from "../../lib/dynamo";
import { ALARM_AGE_MS } from "../../lib/config";

interface SourceItem {
  contentHash: string;
  url: string;
  status: string;
  error?: string;
  fetchedAt: string;
}

export async function handler(): Promise<{ checked: number; alertSent: boolean }> {
  const oneHourAgo = new Date(Date.now() - ALARM_AGE_MS);
  const nowIso = oneHourAgo.toISOString();

  // Scan all failed sources
  const scanResult = await sourcesScan("#s = :failed", {
    ":failed": "failed",
    "#s": "status",
  });

  const failedItems = (scanResult?.Items ?? []) as SourceItem[];
  const stale = failedItems.filter((item) => item.fetchedAt < nowIso);

  if (stale.length === 0) {
    console.info("No stale failed sources found");
    return { checked: failedItems.length, alertSent: false };
  }

  // Build alert body
  const urls = stale.map((item) => item.url).slice(0, 20); // cap at 20 URLs for readability
  const body = [
    `Embedding failures: ${stale.length} source(s) stuck in "failed" > 1hr`,
    "",
    "Affected URLs:",
    ...urls.map((url) => `  - ${url}`),
    ...(urls.length < stale.length ? [`  ... and ${stale.length - urls.length} more`] : []),
  ].join("\n");

  // Publish to SNS
  try {
    await new SNSClient({}).send(
      new PublishCommand({
        TopicArn: process.env.ALERT_TOPIC_ARN ?? "",
        Subject: `[bookmark-digest] Embedding failures: ${stale.length} stale`,
        Message: body,
      })
    );
    console.info(`Alert sent for ${stale.length} stale failed sources`);
    return { checked: failedItems.length, alertSent: true };
  } catch (err) {
    console.error("Failed to send alert:", err);
    return { checked: failedItems.length, alertSent: false };
  }
}
