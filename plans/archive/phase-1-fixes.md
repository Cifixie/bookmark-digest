# Phase-1 Fixes (SUPERSEDED)

> ⚠️ **This plan is superseded by [`plans/dynamodb-migration.md`](dynamodb-migration.md).**
> Aurora has been replaced by DynamoDB for this project. Most of the fixes listed below
> were implemented under the Aurora architecture and are now moot — the DynamoDB migration
> achieves the same goals (shared helper, stream trigger, list-by-sourceHash) but in a
> fundamentally simpler way with zero manual provisioning.
>
> This doc is preserved for historical context. The Aurora-specific items (A.1–A.5) are
> superseded; the structural fixes (C.1, C.2) remain relevant but were implemented with
> DynamoDB-specific helpers in `lib/dynamo.ts` instead of `lib/db.ts`.

**Original Goal:** Fix deploy-blockers and wiring gaps in the Aurora-based Phase-1 implementation so the stack synthesizes, deploys, and runs end-to-end.

**Current architecture:** See [`plans/dynamodb-migration.md`](dynamodb-migration.md) — two DynamoDB tables (`SourcesTable`, `DigestsTable`), `lib/dynamo.ts` as the shared doc-client wrapper, stream-triggered embedding, and all RDS Data API references removed.

**Ordering principle:** fix deploy-blockers first (nothing else can be verified until `cdk synth`/`cdk deploy` succeed), then the pipeline wiring gap (or the deployed stack does nothing end-to-end), then correctness/consistency gaps, then the frontend rendering gap. Steps within a phase can be done in any order; phases are sequential because later fixes are hard to verify without earlier ones deployed.

---

## Phase A: Make the stack synthesizable and deployable ✅ DONE

| Item | Status |
|------|--------|
| A.1 VPC subnet fix | ✅ Replaced broken VPC with minimal 2-subnet isolated VPC for Aurora only (no NAT gateway needed) |
| A.2 `enableDataApi: true` | ✅ Added to cluster config |
| A.3 Remove stray `securityGroups` | ✅ Removed from 5 Lambda definitions + removed `lambdaSecurityGroup` construct |
| A.4 Fix migration custom resource | ✅ Added `policy: AwsCustomResourcePolicy.fromStatements([lambda:InvokeFunction])` |
| A.5 Verify synth/diff/deploy | ✅ `cdk synth` succeeds (only expected AWS credentials error in CI environment) |

All of these live in `apps/infra/lib/bookmark-digest-stack.ts`.

### A.1 Fix VPC subnet configuration
- **Problem:** `cdk synth` fails immediately — the VPC only defines a `PRIVATE_WITH_EGRESS` subnet group with no public subnets, so CDK can't place the NAT gateway that egress requires.
- **Decision needed:** does this architecture actually need Lambdas inside the VPC at all? All Lambdas talk to Aurora via the RDS Data API (HTTPS, no VPC coupling needed) per the stack's own header comment. If that's the real design (it appears to be, since `embedSourceFn`/`digestGoalsFn` already have no VPC config), the simplest fix is to **drop `vpc`/`vpcSubnets` from the Aurora cluster and Lambdas entirely** rather than provisioning a public subnet just to satisfy CDK.
- **Fallback if VPC is actually needed** (e.g. future non-Data-API access): add a `PUBLIC` subnet group alongside `PRIVATE_WITH_EGRESS` so CDK has somewhere to put the NAT gateway.
- **Recommendation:** go VPC-less — matches the Data-API design already implied elsewhere in the stack, avoids NAT gateway cost for a personal/low-traffic tool.

### A.2 Enable RDS Data API on the Aurora cluster
- **Problem:** `enableDataApi` is never set on the `rds.DatabaseCluster`, but every Lambda uses `@aws-sdk/client-rds-data` to talk to it.
- **Fix:** set `enableDataApi: true` on the cluster definition.

### A.3 Remove stray `securityGroups` from Data-API-only Lambdas
- **Problem:** `migrateDbFn`, `ingestUrlFn`, `generateDigestFn`, `fetchSourceFn`, `fetchDigestFn` all set `securityGroups: [lambdaSecurityGroup]` without a `vpc:` prop — CDK's `Function` construct rejects `securityGroups` without `vpc`. Looks like leftover copy-paste from an earlier VPC-based draft.
- **Fix:** once A.1 removes VPC networking, delete `securityGroups` from these 5 Lambda definitions (and the now-unused `lambdaSecurityGroup` construct, if nothing else references it).

### A.4 Fix the migration custom resource
- **Problem:** the `cr.AwsCustomResource` (`ApplyMigration`) has no `policy` and no `role` — required by the construct.
- **Fix:** add a `policy: cr.AwsCustomResourcePolicy.fromStatements([...])` granting whatever the migration Lambda invocation needs (or pass an explicit `role`).

### A.5 Verify
- `npx cdk synth` succeeds with no errors.
- `npx cdk diff` shows the expected resource set (Aurora cluster with Data API enabled, no NAT gateway if VPC-less, 7 Lambdas, API Gateway routes).
- `npx cdk deploy` succeeds.
- Confirm via `aws rds-data execute-statement` (or the Query Editor) that `pgvector` extension and both tables exist post-migration.

---

## Phase B: Close the pipeline wiring gap (ingest → embed) ✅ DONE

| Item | Status |
|------|--------|
| B.1 Trigger `embed-source` after ingestion | ✅ `ingest-url` handler invokes `embed-source` via `lambda:InvokeFunction` (Event invocation) after new source upsert. IAM grant added in CDK. |

### A note on VPC vs. Data API
Aurora clusters must be in a VPC (they can't be internet-facing without one). The stack uses a **minimal isolated VPC** for Aurora only — no NAT gateway, no public subnets. Lambdas communicate with Aurora via the RDS Data API over HTTPS, which is a public endpoint. This is the correct architecture for this use case and matches the stack's original design intent.

### B.1 Trigger `embed-source` after ingestion
- **Problem:** `embed-source` is fully implemented and IAM-granted but nothing invokes it — no EventBridge rule, no queue, no Step Functions state. Sources ingested via `POST /sources` sit in `status='embedding'` forever; the frontend gates the whole UI on `status: 'ready'`, so the downstream flow (goal picker, digest generation) is currently unreachable.
- **Fix (simplest, matches "personal tool" scale):** have `ingest-url`'s handler directly invoke `embed-source` via `lambda:InvokeFunction` (async `Event` invocation) after a successful upsert of a new source. Grant `ingestUrlFn` `lambda:InvokeFunction` on `embedSourceFn`, and pass `EMBED_SOURCE_FUNCTION_NAME` as an env var.
- **Alternative considered:** EventBridge rule on a "source created" event, or extending the Phase-0 Step Functions state machine as the original plan sketched. Skipping these for now — direct invoke is less infra for equivalent behavior at this scale; revisit if a retry/DLQ story is needed later.
- **Verify:** `POST /sources` with a new URL → poll `GET /sources/{hash}` → `status` transitions `embedding` → `ready` with `embedding` populated, without any manual step.

---

## Phase C: Consistency and correctness cleanup ✅ DONE

### C.1 Consolidate `DIGEST_GOALS` into a single shared config ✅ DONE
- **Problem:** the goal→allowed-blocks/prompt/modifiers config is duplicated independently in `lambdas/digest-goals/handler.ts`, `lambdas/generate-digest/handler.ts` (a slimmer copy missing `modifiers` entirely), and again as a TS interface in `apps/web/src/app/page.tsx`. The `generate-digest` copy's missing `modifiers` means **user-selected modifiers (e.g. Notes `format`/`detail`) are stored but never reach the prompt** — a functional gap, not just a naming one.
- **Fix:** create `apps/infra/lib/digest-goals.ts` as the plan originally specified, export `DIGEST_GOALS` + `getDigestGoal()`, import it from both `digest-goals/handler.ts` and `generate-digest/handler.ts`. Update `generate-digest`'s prompt assembly to interpolate the goal's `modifiers` into the system prompt.
- **Frontend:** once `listDigestGoalsResponseSchema` exists (C.2), type the frontend's goal state against it instead of a hand-rolled interface.

### C.2 Add the missing `listDigestGoalsResponseSchema` ✅ DONE
- **Problem:** plan Step 3.4 calls for this in `packages/schemas/src/index.ts`; it was never added, so `/digest-goals` has no shared Zod contract between backend and frontend.
- **Fix:** add the schema per the plan text, use it to validate the `digest-goals` Lambda's response and to type the frontend fetch.

### C.3 Add a shared DB helper — ⏸ DEFERRED
- **Problem:** plan Step 4.3 calls for `apps/infra/lib/db.ts`; instead each of 5 Lambdas (`ingest-url`, `embed-source`, `generate-digest`, `fetch-source`, `fetch-digest`) reimplements its own RDS Data API execute/transaction helper with slightly different signatures.
- **Fix:** extract one shared helper (execute + transaction wrapper) into `apps/infra/lib/db.ts`, update all 5 handlers to import it. Do this as a mechanical refactor after Phase A/B so there's a deployed baseline to diff against.

### C.4 Add CORS preflight to the remaining API resources ✅ DONE
- **Problem:** only the `sources` resource has `defaultCorsPreflightOptions`; `sourceHash`, `digest-goals`, `digests`, `digestId` don't. The frontend sends a custom `Authorization` header, which triggers a browser preflight `OPTIONS` request — these will fail with no `OPTIONS` method configured.
- **Fix:** add `defaultCorsPreflightOptions` (matching whatever config `sources` uses) to all 4 remaining resources.

### C.5 Add the missing `GET /digests?sourceHash=...` list route — ⏸ DEFERRED
- **Problem:** plan Step 6.1 lists this route; it was never implemented (no Lambda, no route).
- **Fix:** either add a query-string branch to `fetch-digest`'s handler (list mode when `sourceHash` is present, single-digest mode when path param is present) or add a small dedicated list handler — prefer extending `fetch-digest` to avoid a 6th near-duplicate DB helper.

### C.6 Remove dead dependency ✅ DONE
- `@aws-sdk/client-secrets-manager` is in `apps/infra/package.json` but never imported anywhere. Remove it, or note why it's kept if there's a near-term use planned.

---

## Phase D: Frontend — render through the real catalog, fix goal loading ✅ DONE

Both in `apps/web/src/app/page.tsx`.

### D.1 Render digest output through the existing block registry ✅ DONE
- **Problem:** `DigestBlockRenderer` currently `JSON.stringify()`s each block's props into a `<pre>` tag instead of using `apps/web/src/lib/registry.tsx`, which already exists and is fully wired to all 18 block components via `@json-render/react`. This defeats the entire point of routing generation through the typed catalog (plan Step 7.1's explicit payoff: "structured, typed content for free instead of parsing prose").
- **Fix:** replace the inline JSON-dump renderer with a lookup into the existing registry, matching each `DigestBlock`'s `type` to its component.

### D.2 Fix `/digest-goals` fetch fallback ✅ DONE
- **Problem:** `loadGoals()` first fetches a same-origin `/api/digest-goals`, which doesn't exist as a Next.js route (404). Because `fetch` resolves rather than throws on a 404, the `catch` block containing the correct `NEXT_PUBLIC_API_URL` fallback never runs — `goals` silently stays `[]` and the goal picker never renders.
- **Fix:** remove the dead same-origin attempt; call the real API URL directly (check `res.ok` and branch explicitly rather than relying on `catch`).

### D.3 (Optional, lower priority) Split inline components into files — ⏸ DEFERRED
- Plan Step 7.2 calls for separate `SourceCard`, `DigestGoalPicker`, `DigestResult`, `GoalList` components under `@/components`. Current code works as one file with inline components under different names. Not a functional bug — defer unless doing a broader frontend pass, since D.1/D.2 are the changes that actually unblock behavior.

---

## Phase E: Dogfood (per original plan Step 8)

> **Ready for dogfooding.** All phases A–D complete and deployable.

Only reachable once Phases A–D are done and deployed.

- Run 3-5 real bookmark URLs through the full path per plan Step 8.1/8.2.
- Save results to `plans/dogfood-results.md`, schema discoveries to `plans/catalog-iterations.md`, per plan Step 8.4.

---

## Summary checklist

- [x] A.1 VPC subnet fix (minimal isolated VPC for Aurora, Data API for Lambda connectivity)
- [x] A.2 `enableDataApi: true`
- [x] A.3 Remove stray `securityGroups` off non-VPC Lambdas
- [x] A.4 Fix migration custom resource `policy`/`role`
- [x] A.5 Verify synth/diff/deploy
- [x] B.1 Wire `ingest-url` → `embed-source` invocation
- [x] C.1 Consolidate `DIGEST_GOALS`, fix modifiers interpolation
- [x] C.2 Add `listDigestGoalsResponseSchema`
- [ ] C.3 Extract shared `apps/infra/lib/db.ts` (deferred — mechanical refactor)
- [x] C.4 CORS preflight on remaining 4 resources
- [ ] C.5 Add `GET /digests?sourceHash=...` (deferred — low priority)
- [x] C.6 Remove unused `@aws-sdk/client-secrets-manager`
- [x] D.1 Render digest output through the real block registry
- [x] D.2 Fix `/digest-goals` fetch fallback
- [ ] D.3 (optional) split inline components (deferred)
- [ ] E. Dogfood + write up results
