# Suggested-bundle UX

**Status:** proposed — not started, verified 2026-08-12. Item 2 in
`plans/ROADMAP.md`'s queue.

**Formerly:** `phase-2d-suggested-bundles.md` (renamed — the phase-N naming
is retired, see `plans/ROADMAP.md`). No content change beyond dropping the
now-stale "split out of phase-2-scope" framing, since that context lives in
`plans/archive/` now, and updating file references.

## What's unblocked

`RelatedFromYourBookmarks`'s similarity signal (`apps/infra/lib/similarity.ts`,
brute-force cosine — see [[decisions]] for why this stays brute-force rather
than a vector index) is live and correct at current corpus scale. That was
the one dependency this needed; it's satisfied and has been since Milestone 1.

## Scope

- After a user completes a multi-source digest, offer "generate related
  digests" for top-K related sources.
- The `RelatedFromYourBookmarks` section (already wired in the frontend) uses
  the similarity signal to power the suggestion, rather than requiring the
  user to manually multi-select via the existing picker.
- Distinct from the manual picker: this is the system proactively judging
  "these sources are related" (reviews of similar products → comparison;
  dated snapshots of the same topic → evolution) instead of the user curating
  the set by hand.

## Open design questions (not yet decided)

- How does the system infer `sourceMode` (`compare` vs `evolution`) for a
  suggested bundle? [[decisions]] records that `sourceMode` is *deliberately
  not inferred* for the manual picker — a suggested bundle has no user
  making that call, so this needs its own answer, not a reuse of that
  decision. A plausible starting point: date-spread of the candidate
  sources (tight clustering in time → `compare`, spread across
  months/years → `evolution`) — untested, needs real bundles to validate
  against, not a rule to trust blind.
- Where does the suggestion surface — inline after digest completion, on the
  source list (now `/browse`, not the old `page.tsx` picker), both?
- Threshold/top-K for what counts as "related enough" to suggest — the
  similarity signal returns a ranked list, not a cutoff.

## Key files

- `apps/infra/lib/similarity.ts` — brute-force cosine similarity (the signal)
- `apps/infra/lambdas/related-sources/handler.ts` — similarity ranking endpoint
- `apps/web/src/app/browse/BrowsePage.tsx` — likely where the suggestion UI
  attaches now that Browse exists (check current picker location before
  assuming `page.tsx` is still it — Milestone 1 added `/browse` after this
  plan was first written)
- `apps/infra/lib/digest-goals.ts` — `sourceMode` templates, relevant to the
  open design question above

## Local-model fit

Low for the design question (needs judgment about the live product, best
kept with Claude/Pi), but once the `sourceMode`-inference heuristic is
decided, the pure scoring function itself (date-spread bucketing, threshold
check) is a reasonable Qwen task — no AWS dependency, easy to unit test
against a handful of hand-built fixtures.

## Verify

```bash
pnpm --filter infra typecheck
pnpm --filter web typecheck
```
