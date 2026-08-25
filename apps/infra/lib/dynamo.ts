/**
 * Shared DynamoDB document client helper for all Lambdas.
 *
 * Uses @aws-sdk/lib-dynamodb to produce a high-level doc-client that
 * marshals/unmarshals native JS values (no AttributeValue wrappers).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand as DocQueryCommand, ScanCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

let _docClient: DynamoDBDocumentClient | null = null;

function getDocClient() {
  if (!_docClient) {
    const client = new DynamoDBClient({});
    // Nested optional fields (e.g. digest Spec elements) can carry explicit
    // `undefined` values; the marshaller throws on those unless told to drop
    // them instead.
    _docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _docClient;
}

/**
 * Update expressions mix `:value` placeholders and `#name` placeholders in one
 * object at call sites (e.g. `{ ":status": "done", "#s": "status" }`). Split
 * them here so callers don't need to pass two separate maps.
 */
function splitExpressionAttributes(placeholders: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  for (const [key, value] of Object.entries(placeholders)) {
    if (key.startsWith("#")) {
      names[key] = value as string;
    } else {
      values[key] = value;
    }
  }
  return { values, names };
}

// ---------------------------------------------------------------------------
// Sources table helpers
// ---------------------------------------------------------------------------

const SOURCES_TABLE = process.env.SOURCES_TABLE_NAME ?? "";
const TAGS_TABLE = process.env.TAGS_TABLE_NAME ?? "";

export async function sourcesGet(contentHash: string) {
  return getDocClient().send(
    new GetCommand({ TableName: SOURCES_TABLE, Key: { contentHash } })
  );
}

export async function sourcesPut(item: {
  contentHash: string;
  url: string;
  content: string;
  contentType: string;
  fetchedAt: string;
  fetchedBy: string | null;
  status: string;
  title?: string;
  description?: string;
  ogImage?: string;
  siteName?: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingAt?: string;
}, conditionExpression?: string) {
  const input: any = { TableName: SOURCES_TABLE, Item: item };
  if (conditionExpression) {
    input.ConditionExpression = conditionExpression;
  }
  return getDocClient().send(new PutCommand(input));
}

export async function sourcesUpdate(contentHash: string, expression: string, expressionAttributes: Record<string, unknown>) {
  const { values, names } = splitExpressionAttributes(expressionAttributes);
  return getDocClient().send(
    new UpdateCommand({
      TableName: SOURCES_TABLE,
      Key: { contentHash },
      UpdateExpression: expression,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ReturnValues: "ALL_NEW",
    })
  );
}

export async function sourcesQueryByUrl(url: string) {
  return getDocClient().send(
    new DocQueryCommand({
      TableName: SOURCES_TABLE,
      IndexName: "UrlIndex",
      KeyConditionExpression: "#url = :url",
      ExpressionAttributeNames: { "#url": "url" },
      ExpressionAttributeValues: { ":url": url },
    })
  );
}

// ---------------------------------------------------------------------------
// Digests table helpers
// ---------------------------------------------------------------------------

const DIGESTS_TABLE = process.env.DIGESTS_TABLE_NAME ?? "";

export async function digestsGet(id: string) {
  return getDocClient().send(
    new GetCommand({ TableName: DIGESTS_TABLE, Key: { id } })
  );
}

export async function digestsPut(item: {
  id: string;
  sourceHash: string;
  sourceHashes?: string[]; // multi-source digests — array of all source hashes
  sourceMode?: string; // multi-source only — how the sources relate (see digest-goals.ts)
  digestGoal: string;
  paramsVersion: string;
  status: string;
  output?: unknown[];
  meta?: Record<string, unknown>; // AI-generated metadata (subject, tags, digestType, tone, length, difficulty, synopsis)
  error?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Semantic embedding of the digest's synopsis (multi-source). */
  embedding?: number[];
  /** When the synopsis was embedded (ISO string). */
  embeddingAt?: string;
}) {
  return getDocClient().send(new PutCommand({ TableName: DIGESTS_TABLE, Item: item }));
}

export async function digestsUpdate(id: string, expression: string, expressionAttributes: Record<string, unknown>) {
  const { values, names } = splitExpressionAttributes(expressionAttributes);
  return getDocClient().send(
    new UpdateCommand({
      TableName: DIGESTS_TABLE,
      Key: { id },
      UpdateExpression: expression,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ReturnValues: "ALL_NEW",
    })
  );
}

export async function digestsQueryBySourceHash(sourceHash: string, digestGoal?: string) {
  const params: any = {
    TableName: DIGESTS_TABLE,
    IndexName: "SourceHashIndex",
    KeyConditionExpression: "sourceHash = :sh",
    ExpressionAttributeValues: { ":sh": sourceHash },
  };
  if (digestGoal) {
    params.KeyConditionExpression += " AND digestGoal = :dg";
    params.ExpressionAttributeValues[":dg"] = digestGoal;
  }
  return getDocClient().send(new DocQueryCommand(params));
}

// ---------------------------------------------------------------------------
// Scan (backs the source list and brute-force similarity search)
// ---------------------------------------------------------------------------

/**
 * Scan the Sources table, following `LastEvaluatedKey` to completion.
 *
 * A single Scan page caps at 1 MB *before* FilterExpression is applied, and
 * source items carry the full fetched `content` plus a multi-hundred-float
 * `embedding` — so a single page holds only a handful of sources. Returning
 * one page silently truncates the result set, which reads as "that's all the
 * bookmarks there are". Always pass `projectionExpression` to keep `content`
 * out of the response unless the caller genuinely needs it.
 *
 * Scanning the whole table is the accepted cost at personal-bookmark scale
 * (see lib/similarity.ts). Revisit if the corpus outgrows it.
 */
export async function sourcesScan(
  filterExpression?: string,
  expressionAttributes?: Record<string, unknown>,
  projectionExpression?: string
) {
  const params: any = { TableName: SOURCES_TABLE };
  const { values, names } = splitExpressionAttributes(expressionAttributes ?? {});
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = values;
  }
  if (projectionExpression) {
    params.ProjectionExpression = projectionExpression;
  }
  if (Object.keys(names).length > 0) params.ExpressionAttributeNames = names;

  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await getDocClient().send(
      new ScanCommand({ ...params, ExclusiveStartKey: lastEvaluatedKey })
    );
    if (page.Items) items.push(...page.Items);
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return { Items: items, Count: items.length };
}

// ---------------------------------------------------------------------------
// Digests scan (backs the browse list — mirrors sourcesScan)
// ---------------------------------------------------------------------------

/**
 * Scan the Digests table, following `LastEvaluatedKey` to completion.
 * Same pagination/projection contract as sourcesScan; used by fetch-digest's
 * list-all-with-filters mode.
 */
export async function digestsScan(
  filterExpression?: string,
  expressionAttributes?: Record<string, unknown>,
  projectionExpression?: string
) {
  const params: any = { TableName: DIGESTS_TABLE };
  const { values, names } = splitExpressionAttributes(expressionAttributes ?? {});
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = values;
  }
  if (projectionExpression) {
    params.ProjectionExpression = projectionExpression;
  }
  if (Object.keys(names).length > 0) params.ExpressionAttributeNames = names;

  const items: Record<string, any>[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await getDocClient().send(
      new ScanCommand({ ...params, ExclusiveStartKey: lastEvaluatedKey })
    );
    if (page.Items) items.push(...page.Items);
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return { Items: items, Count: items.length };
}

// ---------------------------------------------------------------------------
// Tags table (vocabulary for tag normalization/fuzzy matching)
// ---------------------------------------------------------------------------

/** Upsert a tag into the vocabulary table. On insert, `displayTag` is set once and never overwritten. */
export async function tagsUpsert(normalizedTag: string, displayTag: string): Promise<void> {
  const now = new Date().toISOString();

  // Check if tag already exists
  const getParams = { TableName: TAGS_TABLE, Key: { normalizedTag } };
  const get = await getDocClient().send(new GetCommand(getParams));
  const existing = get.Item as { count: number; lastUsedAt: string } | undefined;

  if (existing) {
    // Increment count, update lastUsedAt
    await getDocClient().send(
      new UpdateCommand({
        TableName: TAGS_TABLE,
        Key: { normalizedTag },
        UpdateExpression: "SET #c = #c + :inc, #l = :at",
        ExpressionAttributeNames: { "#c": "count", "#l": "lastUsedAt" },
        ExpressionAttributeValues: { ":inc": 1, ":at": now },
      }),
    );
  } else {
    // Insert new tag with displayTag set once
    await getDocClient().send(
      new PutCommand({
        TableName: TAGS_TABLE,
        Item: {
          normalizedTag,
          displayTag,
          count: 1,
          firstSeenAt: now,
          lastUsedAt: now,
        },
      }),
    );
  }
}

/** Scan the tags table, returning all tags sorted by count desc. */
export async function tagsScan(): Promise<
  Array<{ normalizedTag: string; displayTag: string; count: number }>
> {
  const params = { TableName: TAGS_TABLE, ProjectionExpression: "normalizedTag, displayTag, count" };
  const page = await getDocClient().send(new ScanCommand(params));
  const items = (page.Items ?? []) as Array<{
    normalizedTag: string;
    displayTag: string;
    count: number;
  }>;
  // Sort by count desc — top vocabulary items first
  items.sort((a, b) => b.count - a.count);
  return items;
}

/** Query tags by `tags` array — post-filter matching any of the normalized tag values. */
export async function tagsQueryByNames(tagNames: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (tagNames.length === 0) return result;

  // Build a batch get of the known normalized tags
  const keys = tagNames.map((n) => ({ normalizedTag: n }));
  const requestItems: Record<string, { Keys: typeof keys; ProjectionExpression?: string }> = {
    [TAGS_TABLE]: { Keys: keys, ProjectionExpression: "normalizedTag, displayTag" },
  };

  const batchParams = { RequestItems: requestItems };
  const batchResult = await getDocClient().send(new BatchGetCommand(batchParams));
  const responses = batchResult.Responses?.[TAGS_TABLE] ?? [];
  for (const item of responses) {
    result[item.normalizedTag] = item.displayTag;
  }
  return result;
}
