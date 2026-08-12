# Phase 2d: Suggested-bundle UX

**Context:** split out of `plans/phase-2-scope.md`'s step 5 (originally listed
as part of phase-2's proposed sequencing) so phase-2 itself
(`plans/phase-2-handoff.md`) can be marked fully complete on steps 1-4. Not
started.

**Status: not started.** Nothing in `apps/web` or `apps/infra` implements
this today — verified 2026-08-12.

## What's unblocked

`RelatedFromYourBookmarks`'s similarity signal (`apps/infra/lib/similarity.ts`,
brute-force cosine, see phase-2-handoff.md's "Step 4: reverted" section) is
live and correct at current corpus scale. That was the dependency phase-2
listed for suggested bundles; it's satisfied.

## Scope (from phase-2-scope.md's original step 5)

- After a user completes a multi-source digest, offer "generate related
  digests" for top-K related sources.
- The `RelatedFromYourBookmarks` section (already wired in the frontend) uses
  the similarity signal to power the suggestion, rather than requiring the
  user to manually multi-select via the existing picker (phase-2 step 1).
- Distinct from the manual picker: this is the system proactively judging
  "these sources are related" (reviews of similar products → comparison;
  dated snapshots of the same topic → evolution) instead of the user curating
  the set by hand.

## Open design questions (not yet decided)

- How does the system infer `sourceMode` (`compare` vs `evolution`) for a
  suggested bundle, given `plans/phase-2-handoff.md`'s "Step 1b" explicitly
  decided *against* inferring `sourceMode` from source count/content for the
  manual picker? A suggested bundle has no user making that call, so this
  phase needs its own answer, not a reuse of that decision.
- Where does the suggestion surface — inline after digest completion, on the
  source list, both?
- Threshold/top-K for what counts as "related enough" to suggest — the
  similarity signal returns a ranked list, not a cutoff.

## Key files

- `apps/infra/lib/similarity.ts` — brute-force cosine similarity (the signal)
- `apps/infra/lambdas/related-sources/handler.ts` — similarity ranking endpoint
- `apps/web/src/app/page.tsx` — multi-source picker (step 1), likely where
  the suggestion UI attaches
- `apps/infra/lib/digest-goals.ts` — `sourceMode` templates, relevant to the
  open design question above

## Verify

```bash
pnpm --filter infra typecheck
pnpm --filter web typecheck
```
