# Gotchas

## A single API Gateway resource+method can only route to one Lambda

`GET /digests` (root, no path param) was already load-bearing before Phase-3:
`fetch-digest`'s handler supports `?sourceHash=` there to list digests for one
source, and `apps/web/src/app/digests/page.tsx` depends on that exact
response shape (`output`/`error`/`paramsVersion` included). A first pass at
adding a Phase-3 "list all digests with filters" mode created a *second*
Lambda and repointed the `GET /digests` method to it — which silently orphaned
`fetch-digest`'s sourceHash branch (API Gateway has exactly one integration
per resource+method, so the old Lambda simply stopped receiving root-level
requests) and broke the existing per-source digest lookup. Fixed by folding
the list-all-with-filters mode into `fetch-digest` itself as a third branch,
rather than adding a competing route. Before repointing any existing
resource+method's integration, grep the frontend for every call to that exact
path and check what the *current* Lambda there already handles — don't trust
a plan doc's claim about who owns a route without checking the live wiring.

## New API Gateway resources need an explicit route, not just a Lambda + IAM grant

Creating a `NodejsFunction` construct and granting it permissions does
nothing on its own — `.addResource()` + `.addMethod()` on the API Gateway
tree is a separate, easy-to-forget step. A first pass at Phase-3 semantic
search built and wired IAM for `SearchSourcesFunction` but never called
`sources.addResource("search").addMethod(...)`, so `GET /sources/search`
didn't exist; the request fell through to the sibling `/sources/{sourceHash}`
resource instead (matching `sourceHash="search"`) and 404'd. `cdk diff` would
have shown this immediately — no `AWS::ApiGateway::Method` for the new route
— so diff the API surface, not just the Lambda/IAM diff, when adding an
endpoint. See [[current-work]].

## `digestsUpdate`/`sourcesUpdate`'s placeholder object needs BOTH the `#name` and `:value` entries

`lib/dynamo.ts`'s update helpers split one placeholders object into
`ExpressionAttributeNames`/`ExpressionAttributeValues` purely by whether each
key starts with `#`. If an `UpdateExpression` references `#foo` but the
caller only put `:foo` in the object (forgot the `"#foo": "foo"` entry),
DynamoDB throws a ValidationException at call time — not a type error, not
caught until the Lambda actually runs. This bit Phase-3's DigestMeta save: the
code pushed `"#meta = :meta"` into the SET clause but never added
`"#meta": "meta"` to the attributes object, so every digest that generated
meta successfully failed to save and got marked `status: "failed"` instead of
`"done"`. When adding a conditional field to an update expression, add the
name/value pair together in the same `if` block, not just the value.
