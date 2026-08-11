# BookmarkDigest — Rules to Code By

_Standing reference for any development phase. These are settled decisions, not suggestions to re-derive._

---

## 1. Generation Tone

Apply these to every AI generation prompt, especially for **Explain** and **Learn** digest types:

- Write as if explaining to a smart friend who has never heard of the topic.
- Never use "utilize." Use "use."
- Replace jargon with an analogy or plain equivalent the first time it appears.
- Avoid passive voice.
- No bullet points inside running prose — use full sentences there.
- Section subtitles frame WHY a section matters, not just WHAT it contains.

## 2. SourceMeta Fields

`SourceMeta` always carries: `title`, `author`/`channel`, `publisher`, `date`, `url`.

Citation format:

- Written source: _"Based on [Title] by [Author], [Publisher], [Year]."_
- Temporal source (video): _"Based on [Video Title] by [Channel] on YouTube."_

## 3. Block-Selection Heuristic

Before choosing which Tier 2 blocks to populate for a digest, answer:

> "What is the most interesting or surprising thing about this content, and how can the layout make that clear at a glance?"

Let the answer drive block selection — e.g. front-load `StatBlock` for data-heavy sources; lead with `Callout`/warning content for cautionary sources.

## 4. KeyPoint Category Enum

`KeyPoint` (and `Callout` where relevant) carries a semantic `category` field:

```
KeyPoint.category: enum([
  "concept", "practice", "risk", "future", "example",
  "planning", "memory", "tools", "challenge", "harness"
])
```

| Category    | Use for                               |
| ----------- | ------------------------------------- |
| `concept`   | Definitions, mechanisms, abstractions |
| `practice`  | Actionable guidance, what to do       |
| `risk`      | Warnings, failure modes, limitations  |
| `future`    | Predictions, open questions           |
| `example`   | Real-world examples, case studies     |
| `planning`  | Strategy, planning topics             |
| `memory`    | Memory, persistence topics            |
| `tools`     | Tooling topics                        |
| `challenge` | Hard problems                         |
| `harness`   | Harness/infrastructure topics         |

Generalize `memory`, `tools`, `harness` if a digest's source material falls outside AI/engineering — don't force-fit.

## 5. Dynamic Category Pipeline

New presentational blocks follow a fixed four-step lifecycle:

1. AI proposes a new catalog entry via tool call.
2. Render it through json-render if approved for this run.
3. Document it in the catalog (schema + one-line description).
4. Promote it through human curation before it's available generally.

Never let a model add a rendering block directly to the production catalog without this pipeline.

## 6. Design Tokens

Accent color varies by topic domain, set via design tokens — not hardcoded per page:

- Technology / AI / engineering → teal `#0d9488`
- Science / research / academia → indigo `#4f46e5`
- Business / strategy / product → amber `#d97706`
- Health / biology / nature → green `#16a34a`

This is a design-pass concern — apply it when the design pass is active, not before.

## 7. Scope Boundaries

- Digest rendering goes through json-render exclusively. Never hand-author HTML/CSS output for a digest page.
- Source ingestion uses Firecrawl (written) and yt-dlp (temporal) only. Don't add a third tool without clearing a high bar — check for overlap with existing tools and real compute cost first.
- Tier 1/Tier 2 vocabulary (hero, big-idea, card-grid, steps, examples-row, caution-list, stat-row, pillars, takeaway) is the reference set for what a digest section can contain. Extend it deliberately through the pipeline in Rule 5, not ad hoc.

## 8. Generation Prompt Bans Dynamic Props — Revisit Later

`generate-digest`'s prompt (`apps/infra/lambdas/generate-digest/handler.ts`) explicitly forbids `repeat`, `state`, and dynamic prop expressions (`$state`, `$item`, `$bindState`, `$template`, `$cond`). `catalog.prompt()` (from `@json-render/core`) teaches these as the way to build *interactive* apps with a runtime state model, but a digest is generated once from content the model already has in full — there's nothing to defer to runtime, so the model was using them anyway and emitting objects (e.g. `title: {"$item":"title"}`) where a plain string prop was expected, failing validation.

**Revisit when:** the renderer actually implements interactive digest affordances — e.g. `ChecklistItem`'s toggle (currently `apps/web/src/components/digestBlocks/ChecklistItem/ChecklistItem.tsx` just renders the static `checked` prop, no `on.press`/`setState` wiring yet) or `FaqItem` disclosure. The `StateProvider`/`VisibilityProvider`/`ActionProvider` wiring already exists in `apps/web/src/app/page.tsx` and `digests/[digestId]/page.tsx`, so the renderer side is ready — only the toggle handlers and a scoped prompt exception (allow `$state`/`on` for just these components, keep `repeat`/`$item`/`$template` banned for content authoring) are missing.
