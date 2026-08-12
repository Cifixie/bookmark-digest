# Thin-source detection

**Status:** deferred — deliberately not built. Blocked on data, not on design.

**Goal:** refuse to spend a generation request on source material that cannot
support a digest, and mark the source so it can be re-fetched instead.

## Why this exists

Digest `80984bad-a27f-4368-9cd1-00d31084d42f` (`summary`, gemini-3.6-flash) was
generated from a Firecrawl scrape of a YouTube watch page. The stored content was
13,556 characters of page chrome: a `401` error banner, nav, "Sign in", the
un-clicked `Show transcript` button, view/like counts, and the recommendation
sidebar. The talk itself was not in there.

The model had the ~90-word video description as its only real signal. It produced
a complete, confident, well-shaped page: five invented principles ("Intentional
Layout Hierarchy", "Contextual Component Responsiveness", …) that appear nowhere
in the talk, a StatCard row built from view and like counts, and a "Related CSS
Day & Web UI Talks" section built from the sidebar. It validated cleanly and was
stored as `done`.

One of the three fixes is in, one was tried and reverted:

1. ~~**Ingestion is URL-aware** (`apps/infra/lib/youtube.ts`)~~ — reverted from
   the Lambda. YouTube videos briefly got their transcript from the InnerTube
   caption endpoint instead of a scrape (59,217 characters of real content
   instead of 13,556 of chrome, for this exact video). But from Lambda's
   shared IP ranges, that endpoint silently came back with no caption tracks
   on most requests — no error, YouTube's anti-abuse system just declines to
   serve captions to that caller — while working fine from a residential IP.
   Not fixable from Lambda, so it's gone from there. The same fetch logic
   lives on as a local CLI (`apps/infra/scripts/youtube-transcript.ts`, run
   via `pnpm --filter infra youtube-transcript <url>`) — it works reliably
   from a normal residential connection, which is the whole difference.
   `ingest-url` accepts an optional `content` field on `POST /sources` (and
   the web app has a "Paste text instead of fetching" box for it): run the
   script, paste its output in, stored directly with `fetchedBy: "manual"`,
   no fetch attempted server-side.
2. **`GROUNDING_RULES`** (`apps/infra/lib/digest-goals.ts`) — tells the model
   that page furniture is not content, that error text means the fetch failed,
   and that reporting thin material is an acceptable output.

This document is the third: an **input-side** guard, in `runGeneration`, before
the request is spent. (1) fixes one source type; (2) asks the model to
self-report, which is exactly what an inadequately-grounded model is bad at.
Neither actually stops the request.

## Why it is deferred

The obvious heuristics do not separate the classes. Measured across all 11 stored
sources, where `link%` is the share of characters inside markdown link/image
syntax and `w/c` is words per character:

```
link%= 64.1 chars= 13556 words= 1966 w/c=0.145  youtube.com/watch?v=8FSLsVAJj2w        ← BAD (chrome)
link%= 63.3 chars= 10002 words= 1415 w/c=0.141  uxdesign.cc/how-to-write-a-design-md…  ← GOOD
link%= 46.1 chars= 19162 words= 3183 w/c=0.166  jgothelf.substack.com/p/giving-up-…    ← GOOD
link%= 44.3 chars=  6573 words= 1066 w/c=0.162  vercel.com/blog/working-with-figma-…   ← GOOD
link%= 38.4 chars= 31514 words= 5060 w/c=0.161  hbr.org/2026/06/how-people-are-really… ← GOOD
link%= 30.9 chars= 17533 words= 2585 w/c=0.147  venturebeat.com/technology/agentic-ai… ← GOOD
link%= 30.7 chars=  9803 words= 1589 w/c=0.162  vercel.com/blog/ai-powered-prototyping ← GOOD
link%= 26.3 chars= 15812 words= 2576 w/c=0.163  claude.com/blog/the-new-rules-of-cont… ← GOOD
link%= 19.9 chars= 26544 words= 3594 w/c=0.135  freecodecamp.org/news/stop-trusting-…  ← GOOD
link%= 12.3 chars= 43201 words= 6862 w/c=0.159  darioamodei.com/post/policy-on-the-ai… ← GOOD
link%=  0.4 chars= 56682 words=10738 w/c=0.189  youtube.com/watch?v=K7dBRuSDWTw        ← GOOD (transcript)
```

The finding: **the bad source and a perfectly good uxdesign.cc article are
adjacent on every metric** — 64.1% vs 63.3% link density, 0.145 vs 0.141 words
per character, 13.5k vs 10.0k characters. Any threshold catching the first
rejects the second. Word density is flat (0.135–0.189) across the whole corpus
and carries no signal at all.

A length floor alone is also insufficient for the motivating case: at 13,556
characters the bad source clears any floor low enough not to reject the 6,573
character Vercel article.

Sample size is 11, with exactly one known-bad example. That is too little to fit
a threshold to, and a false positive here is worse than a false negative: it
blocks a digest the user asked for, whereas the current failure at least produces
something they can inspect.

## What to build once there is data

Two checks, in order of confidence.

### A. Fetch-failure markers (high confidence — could be built now)

Substring matching for evidence that the fetch did not get the article. Verified
against the corpus: present in the bad source, absent from all 10 good ones.

```
"That’s an error"      bad=True  good=False   (note: U+2019, not ')
"Skip navigation"      bad=True  good=False
"Show transcript"      bad=True  good=False
"Sign in"              bad=True  good=False
"Enable JavaScript"    bad=False good=False
```

Caveats to respect:
- Match near the **start** of the content (first ~1,000 chars), not anywhere. An
  article *about* error handling will contain error strings in its body.
- `"Sign in"` and `"Show transcript"` are the weakest — they are page chrome, so
  they indicate a scrape that captured navigation, which is the actual signal.
  But they would also fire on an article quoting UI copy. Prefer requiring two
  or more markers, or weighting `That’s an error` alone as sufficient.
- Normalize the apostrophe. The literal Google error page uses U+2019.

This is the piece worth shipping first. It is cheap, it is verified, and it
catches the "fetch silently failed" class that produces the worst output.

### B. Signal-density scoring (needs data)

Deferred until the corpus has enough labelled examples. Do not fit a threshold
to fewer than ~50 sources with at least ~10 known-bad.

To get there, instrument rather than guess: on every generation, log the metrics
above (`chars`, `link%`, `w/c`, plus line-count and median-line-length, which
were not captured in the table because the transcript is a single line and made
them meaningless for that row). Then label outcomes — a digest the user deletes,
regenerates, or that fails validation is a weak signal for a bad source. Revisit
when the labelled set is large enough to check separability, rather than
assuming it.

Candidate features not yet measured, which may separate where link density does
not:
- **Positional** — is the link density concentrated in one region (a sidebar) or
  spread through the body? The YouTube chrome front-loads its links; an article
  distributes them. This is the most promising untested feature.
- Repeated-line ratio (the bad source repeats its title and view count verbatim
  several times).
- Ratio of the longest paragraph to the median — chrome has no long paragraphs.

### C. Behaviour on detection

Do **not** silently fail the digest. The source is what is broken, not the
digest request.

- Mark the source row: `status: "thin"` plus a reason, so it is distinguishable
  from `ready` and can be re-fetched by a better fetcher later.
- Fail the digest with a specific, user-facing error naming the source and the
  reason — not the current generic `"Internal error during generation"`.
- Surface it in the web app as a re-fetch affordance rather than a dead end.
- Log the metrics that triggered it, so thresholds can be tuned from real
  rejections.

## Where the code goes

`runGeneration` in `apps/infra/lambdas/generate-digest/handler.ts`, immediately
after the existing `missing.length > 0` check (which handles absent content) and
**before** the `status: "generating"` update — that is the last point where no
model quota has been spent. The existing `MIN_ELEMENTS` / `isThin` check further
down is the output-side counterpart and stays as it is; this is deliberately a
separate check, because thin output from rich material is a model problem while
thin output from thin material is an ingestion problem, and conflating them
would hide which one occurred.

## Cleanup owed

The bad source is still in DynamoDB with `status: "ready"`, so re-submitting that
URL hits the dedup in `ingest-url` and returns the stale row rather than
re-fetching via the new transcript path.

- Source: `contentHash 7d061702b6ac82745119f6d73876c0acfd2d5dc6a360370f4b3603059f8933ca`
- Digest: `80984bad-a27f-4368-9cd1-00d31084d42f`

Both need deleting to re-ingest and regenerate. The content has already been
preserved at `docs/references/thin-sources/youtube-watch-page-scrape.md` — it is
currently the only labelled bad example, and section B needs it — so the rows can
be deleted safely.
