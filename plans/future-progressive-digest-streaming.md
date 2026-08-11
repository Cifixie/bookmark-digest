# Future idea: stream digest patches progressively to the client

**Status:** Not planned — parking lot / worth revisiting after `plans/commit-to-render-json.md` lands.

## The idea

`@json-render/core`'s native wire format is RFC-6902 JSON Patch lines that progressively build a `Spec` tree, and `@json-render/react` ships a `useUIStream` hook specifically to consume that: render blocks as they arrive instead of waiting for the whole digest to finish generating. Right now the UX is `POST /digests` → spinner → `pollDigest` until `status: "done"` — a live, block-by-block reveal would be a nicer perceived-latency experience for something that takes several seconds of Gemini generation.

## Why it's not part of the current plan

- **Infra shape doesn't support it today.** `apps/infra/lib/bookmark-digest-stack.ts:134` uses `apigw.RestApi`, which buffers the full Lambda response — it cannot relay a streaming response to the browser. True streaming would need a separate Lambda Function URL (`InvokeMode.RESPONSE_STREAM`) or a WebSocket API, alongside the existing REST API, not a small tweak to the current endpoint.
- **Tension with the correctness fix.** The current plan's whole point is to validate the fully compiled `Spec` (structural + per-type props) before ever accepting it, retrying generation if a block comes back with empty/invalid props. If patches are streamed straight to the browser as they're generated, the user would see content render before that validation gate runs — a bad block could flash on screen before a retry replaces it. That reintroduces, for the live view, the exact failure mode (empty/wrong props reaching a user) this effort exists to eliminate.
- Client-side would also need to switch this one flow from polling to stream-consumption, which is its own scoped piece of work.

## What to look into, if/when this gets picked up

1. Whether to hold the progressive render behind a "provisional" state until final validation passes (swap in a corrected render on retry), rather than trusting each streamed patch as final.
2. Lambda Function URL with `RESPONSE_STREAM` vs. a WebSocket API Gateway route — tradeoffs for this specific Lambda (auth, CORS, cost, CDK complexity) alongside the existing `RestApi`.
3. Whether `useUIStream` from `@json-render/react` can be pointed at a Function URL directly, or needs a thin adapter.
4. Whether it's worth it at all given digest generation is not that slow in practice — measure actual p50/p95 generation latency post-migration before investing here.
