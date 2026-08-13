# Source detail page

**Status:** proposed — not started, verified 2026-08-12 (no route exists
under `apps/web/src/app` for a source detail view). Item 4 in
`plans/ROADMAP.md`'s queue — standalone, no dependencies on anything else in
the queue.

## Why this exists

Browse (`/browse`) ships with Sources and Digests both listed, but a Source
row's click-through currently goes straight to the original external URL
instead of an in-app page. `plans/archive/phase-3-browse-search.md` flagged
this as TBD when Browse shipped and it was never picked up. `/digests/:id`
already exists as the precedent to follow for shape.

## Scope

A `/sources/:contentHash` route showing:
- `title` (fallback: hostname + truncated path), `url`, `domain`,
  `contentType`, `status`, `fetchedAt`/`fetchedBy`.
- The extracted `content` itself — currently only visible via
  `GET /sources/{sourceHash}`'s raw JSON, never rendered.
- A list of digests generated from this source (`GET /digests?sourceHash=`,
  already exists via the `SourceHashIndex` GSI — no new backend needed for
  this part).
- The `RelatedFromYourBookmarks` panel, if reusable directly from wherever
  it's currently rendered — check before assuming; it may currently only be
  wired into the digest-completion flow.

## What's already there vs. what's new

No new backend work expected — `GET /sources/{sourceHash}` and
`GET /digests?sourceHash=` both already exist. This is a frontend-only
addition: one new route + component, and updating Browse's source row
click-through to link internally instead of externally (keep an explicit
"open original ↗" affordance alongside — don't remove the ability to see
the real page).

## Local-model fit

High. This is a self-contained React page against two already-existing,
already-typed endpoints — no CDK, no IAM, no cross-cutting architectural
decisions. A reasonable candidate to hand to Qwen wholesale, with Claude/Pi
doing a review pass rather than the implementation.

## Verify

```bash
pnpm --filter web typecheck
pnpm --filter web dev   # click through from /browse, confirm the route renders and links back out
```
