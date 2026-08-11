/**
 * Shared DynamoDB document client helper for all Lambdas.
 *
 * Uses @aws-sdk/lib-dynamodb to produce a high-level doc-client that
 * marshals/unmarshals native JS values (no AttributeValue wrappers).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand as DocQueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

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
  error?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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
