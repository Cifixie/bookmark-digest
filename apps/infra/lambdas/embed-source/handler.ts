/**
 * embed-source Lambda — Phase-1 embedding step (DynamoDB Stream-triggered).
 *
 * Triggered automatically when a new item is inserted into the Sources table
 * (via DynamoDB Stream with filter for INSERT events). No explicit DB query
 * needed — the stream record contains the new image.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { sourcesUpdate } from "../../lib/dynamo";

const BEDROCK_MODEL = process.env.BEDROCK_EMBEDDING_MODEL ?? "amazon.titan-embed-text-v2:0";
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "eu-north-1" });

async function embedText(text: string): Promise<number[]> {
  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: BEDROCK_MODEL,
    body: JSON.stringify({ inputText: truncated, dimensions: 1536, normalize: true }),
    contentType: "application/json",
    accept: "application/json",
  }));
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  if (!parsed.embedding) throw new Error(`Bedrock returned no embedding: ${JSON.stringify(parsed)}`);
  return parsed.embedding as number[];
}

// --- DynamoDB Stream event handler ---

interface DynamoDBStreamEvent {
  Records: Array<{
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    dynamodb: {
      NewImage: Record<string, { S?: string | null; N?: string | null; L?: any[]; M?: Record<string, any> }>;
    };
  }>;
}

export async function handler(event: DynamoDBStreamEvent): Promise<{ embedded: number; errors: number }> {
  let embedded = 0;
  let errors = 0;

  for (const record of event.Records) {
    try {
      const newImage = record.dynamodb.NewImage;
      const contentHash = newImage.contentHash?.S;
      const content = newImage.content?.S;
      const fetchedAt = newImage.fetchedAt?.S;

      if (!contentHash || !content) {
        console.warn("Stream record missing contentHash or content, skipping");
        errors++;
        continue;
      }

      if (content.trim().length === 0) {
        await sourcesUpdate(contentHash, "SET #s = :status, #e = :err", {
          ":status": "failed",
          ":err": "No content to embed",
          "#s": "status",
          "#e": "error",
        });
        errors++;
        continue;
      }

      const vector = await embedText(content);
      const now = new Date().toISOString();

      await sourcesUpdate(contentHash, "SET #vec = :vector, #em = :model, #ea = :at, #s = :status", {
        ":vector": vector,
        ":model": BEDROCK_MODEL,
        ":at": now,
        ":status": "ready",
        "#vec": "embedding",
        "#em": "embeddingModel",
        "#ea": "embeddingAt",
      });

      embedded++;
    } catch (err) {
      const contentHash = record.dynamodb.NewImage?.contentHash?.S ?? "unknown";
      console.error(`Embedding failed for ${contentHash}:`, err);
      errors++;
    }
  }

  console.info(`Embedding complete: ${embedded} successful, ${errors} errors`);
  return { embedded, errors };
}
