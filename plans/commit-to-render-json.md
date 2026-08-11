# Adopt json-render's native tree/Spec model for digest generation

## Status: ✅ IMPLEMENTED, VERIFIED, and COMMITTED — only live deploy/data-migration steps remain

## Context

`generate-digest` currently produces a **flat array** of content blocks (`DigestBlock[]`), stored verbatim in DynamoDB and rendered by hand-rolled `.map()` loops in two places on the web side. In parallel, an in-progress (uncommitted) edit wired `catalog.prompt()` (from `@json-render/core`) into the Lambda's system prompt — but `catalog.prompt()` describes json-render's actual native format: a **nested tree** (`Spec = { root, elements: Record<key, {type, props, children, visible}> }`) built via streaming RFC-6902 JSON Patch lines. The Lambda's `generateObject` call, however, targets a hand-written flat Zod schema (`{ blocks: [{type, props}] }`). That mismatch is why Gemini falls back to schema-minimum output (`props: {}`).

Rather than patch the prompt text to match the current flat model (a band-aid), the decision (confirmed with the user) is to go the other direction: **finish adopting json-render's actual tree model**, which the catalog was already halfway designed for — `Grid.catalog.ts`'s description already says *"Pass child element keys to arrange them"*, and the web app's `registry.tsx`/`iterateComponents` boundary already forwards a `children` prop through to every block component, unused. This is completion of the original design intent, not a new direction.

Two things confirmed by reading `@json-render/core`/`@json-render/react` source directly (not assumed):

1. **The library's own schema does NOT enforce per-component props on a multi-component catalog.** `catalog.zodSchema()`'s `propsOf` case falls back to `z.record(z.string(), z.unknown())` whenever a catalog has more than one component (ours has 19) — core `dist/index.mjs` ~line 1370. So adopting the tree model does *not* by itself fix "empty props" — we still need our own per-type props check layered on top, built from the props schemas already defined per block (`Card.props`, `TLDR.props`, etc. in `packages/catalog/src/digestBlocks/*.catalog.ts`).
2. **No streaming infrastructure is required to consume the tree format.** `@json-render/core` exports `compileSpecStream(stream: string, initial?): T` (`dist/store-utils-D98Czbil.d.ts:566`) — takes the **entire** JSONL patch text as one string and returns the fully-compiled object in one call. So the Lambda can keep its current synchronous `ai` SDK call/retry-loop shape; swap `generateObject` for `generateText`, then run `compileSpecStream(result.text, { root: "", elements: {} })` to get the final `Spec`. No `SpecStreamCompiler`/chunk-by-chunk plumbing, no API Gateway streaming response needed.

## Implementation

### ✅ 1. `packages/catalog` — schema/type changes
- ✅ `packages/catalog/src/page/DigestSection.schema.ts`: changed from `content: z.array(z.string())` to `spec: specSchema.optional()` (import `Spec` from `@json-render/core`, use `catalog.zodSchema()` as the schema type)
- ✅ `packages/catalog/src/index.ts`: updated `DigestPage` interface — `sections: DigestSection[]` where each section has `spec: Spec` (replaced flat `content: DigestBlock[]`)
- ✅ `packages/catalog/src/digestBlockProps.ts`: new file — `Record<string, z.ZodType>` built by mapping over `digestBlocks/*.catalog.ts`'s `props` exports
- ✅ `packages/catalog/src/validateDigestSpec.ts`: new file — runs `catalog.validate()` for structural checks, then walks `spec.elements`, looks up each element's `type` in the props map, and `.safeParse`s its `props`
- ✅ Added `export { type Spec } from "@json-render/core"` to catalog index for convenience
- ✅ Updated `packages/catalog/src/__tests__/pageFixture.test.ts` for Spec-shaped fixtures
- ✅ All catalog tests pass (12/12)

### ✅ 2. `apps/infra/lambdas/generate-digest/handler.ts`
- ✅ Replaced `generateObject` with `generateText` — **updated: using `generateObject`** with a flexible Spec-structure Zod schema. The schema accepts any props shape (`z.record(z.string(), z.unknown())`); strict per-type validation is done afterward by `validateDigestSpec()`.
- ✅ Schema omits `root` (we set it ourselves from the first element key — avoids "root not found in elements" errors from Gemini).
- ✅ Explicit format instructions in system prompt with concrete JSON example, sequential key convention (`el-0`, `el-1`, ...), and rules about real prop values.
- ✅ After each attempt: `validateDigestSpec(parsedSpec)` — only accepts on structural validity **and** per-type props validity; otherwise fall through to the existing retry loop.
- ✅ Stores the compiled `spec` (not `blocks`) as `output` in `digestsUpdate(...)`.
- ✅ Added `@json-render/core` dependency to `apps/infra/package.json`.
- ✅ Lambda/infra package builds successfully.

### ✅ 3. `packages/schemas/src/index.ts`
- ✅ `digestSchema.output` changed to `specOutputSchema.nullable()` (Spec-shaped)
- ✅ `fetchDigestResponseSchema.output` changed to `specOutputSchema.nullable()`
- ✅ Defined `specOutputSchema` as `z.object({ root: z.string(), elements: z.record(...) })`
- ✅ Schemas package builds successfully

### ✅ 4. Web rendering — swapped to json-render's `Renderer`
- ✅ `apps/web/src/components/page/DigestPage.tsx`: replaced hand-rolled `BlockRenderer`/`.map()` over `section.content` with `<Renderer spec={section.spec} registry={registry} />`
- ✅ `apps/web/src/app/page.tsx`: replaced `DigestBlockList` with `DigestSpecRenderer` wrapping `<Renderer>`; updated `DigestResponse.output` type from `unknown[]` to `Spec`
- ✅ `Grid.tsx` (`apps/web/src/components/digestBlocks/Grid/Grid.tsx`): now renders `{children}` inside its grid wrapper
- ✅ **Added `SectionContainer` layout component** — root wrapper with margin + optional accent color border; auto-wrapped by Lambda when Gemini omits it
- ✅ Updated `apps/web/src/stories/DigestPage.stories.tsx` to use Spec-shaped fixtures
- ✅ Web app builds successfully

### ⏭ 5. Data migration
- [ ] Check DynamoDB `digests` table for existing `status: "done"` rows before deployment
- [ ] Existing rows with old flat `output: DigestBlock[]` shape will fail the new `specOutputSchema` zod parse on the web side (type mismatch), but won't crash — the Renderer will handle `null`/`undefined` specs gracefully
- [ ] Consider adding a conditional in the web app's `DigestResponse` parsing to gracefully handle both old (`unknown[]`) and new (`Spec`) shapes during the transition

## Verification
1. ✅ `cd packages/catalog && pnpm test` — 18 tests pass (grew from 12 after `validateDigestSpec.test.ts` was added)
2. ✅ `cd packages/catalog && pnpm build` — clean build
3. ✅ `cd packages/schemas && pnpm build` — clean build  
4. ✅ `cd apps/infra && pnpm build` — clean build (Lambda compiles against new Spec type)
5. ✅ `cd apps/web && pnpm typecheck` && `pnpm build` — clean typecheck and full `next build`
6. ⏭ Deploy and generate a real digest end-to-end (`POST /digests`), inspect the stored DynamoDB row: confirm `output.elements[...].props` are populated with real values (not `{`}`), and that `Grid` (if the model chooses to use it) actually nests `Card`/`StatCard` children.
7. ⏭ Run the web app (`pnpm dev` in `apps/web`) and load a generated digest — confirm `<Renderer>` renders identically to the old flat renderer for non-nested content, and renders nested children correctly for any `Grid` block.
