# Phase-0 Verification Checklist

Give this to Claude Code as-is: "Read CLAUDE.md, then work through
PHASE-0-CHECKLIST.md and report the status of each item." It should check
each box against the actual repo/AWS state, not assume completion from
CLAUDE.md's notes alone.

## 1. Workspace integrity

- [ ] `pnpm install` completes with no errors from repo root
- [ ] `pnpm -r typecheck` passes across all packages/apps
- [ ] Workspace packages (`@bookmark-digest/schemas`, `catalog`, `shared`) resolve as symlinks in `apps/web/node_modules/@bookmark-digest/` and `apps/infra/node_modules/@bookmark-digest/`
- [ ] No package has drifted to use `npm`/`yarn` lockfiles alongside pnpm's

## 2. Schemas package

- [ ] `packages/schemas/src/index.ts` exports `Bookmark`, `Document`, `Job`, `submitUrlRequestSchema`, `submitUrlResponseSchema`
- [ ] `packages/schemas` has no dependency beyond `zod` (check `package.json` — this was an intentional constraint, verify it hasn't drifted)
- [ ] `pnpm --filter schemas typecheck` passes

## 3. CDK stack — code review

- [ ] `apps/infra/lib/phase0-stack.ts` provisions: S3 bucket, Cognito User Pool + Client, Cognito authorizer, API Gateway with CORS, one Lambda, one Step Functions state machine
- [ ] Cognito User Pool has `selfSignUpEnabled: false`
- [ ] API Gateway's `POST /bookmarks` method has `authorizationType: COGNITO`
- [ ] CORS preflight is configured on `/bookmarks` (check it allows `Authorization` header)
- [ ] `npx cdk synth` runs with no errors from `apps/infra`

## 4. CDK stack — deployed state (check against real AWS, not just code)

- [ ] `npx cdk diff` from `apps/infra` shows **no pending changes** (confirms deployed stack matches current code — if it shows a diff, the last deploy didn't include the CORS/Cognito changes and needs re-running)
- [ ] Stack outputs (`ApiUrl`, `UserPoolId`, `UserPoolClientId`, `StateMachineArn`) are all present in `aws cloudformation describe-stacks --stack-name BookmarkDigestPhase0`
- [ ] Exactly one Cognito user exists in the pool (`aws cognito-idp list-users --user-pool-id <id>`) — flag if zero or more than one, since this is meant to be single-user

## 5. Frontend — auth flow

- [ ] `apps/web/.env.local` exists and contains `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID` matching the real deployed values (not placeholders)
- [ ] `apps/web/src/app/sign-in/page.tsx` handles both normal sign-in and the `NEW_PASSWORD_REQUIRED` challenge
- [ ] `apps/web/src/app/page.tsx` redirects to `/sign-in` when not authenticated
- [ ] No leftover local `/api/bookmarks` stub route exists (should be deleted — check `apps/web/src/app/api/`)
- [ ] `pnpm --filter web typecheck` passes

## 6. End-to-end smoke test (manual — Claude Code should report it can't run this itself, and hand it back to you)

- [ ] `pnpm --filter web dev`, visit `localhost:3000`, get redirected to sign-in
- [ ] Sign in with the Cognito user's credentials succeeds
- [ ] Submitting a URL returns a JSON response with `bookmarkId`, `jobId`, `status: "received"` — no CORS error, no 401
- [ ] Sign-out button works and returns to `/sign-in`

## 7. Scope discipline (things that should NOT exist yet — flag if found)

- [ ] No Postgres/RDS/Aurora resources in the CDK stack
- [ ] No real scraping logic (Firecrawl/yt-dlp) in the ingest Lambda
- [ ] No Bedrock/Vercel AI SDK calls anywhere yet
- [ ] `packages/catalog/src/index.ts` is still the empty placeholder (Tier 1/2 work hasn't started — confirms we're not accidentally ahead of plan in a way that skipped review)

## Exit criteria

Phase-0 is done when sections 1–6 are all checked and section 7 confirms
nothing got ahead of scope. Once this checklist is clean, move to Phase-1:
`packages/catalog` Tier 1/2 `defineCatalog` schemas.
