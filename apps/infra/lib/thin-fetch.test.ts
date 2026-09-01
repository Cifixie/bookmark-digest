import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectThinFetch } from "./thin-fetch";

// Resolve the preserved thin-scrape fixture relative to this test file rather
// than the process cwd, so the suite passes whether vitest runs from the repo
// root or from `apps/infra`.
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "../../../docs/references/thin-sources/youtube-watch-page-scrape.md");

describe("detectThinFetch", () => {
  it("flags the preserved thin source scrape (YouTube watch page)", async () => {
    const content = await readFile(FIXTURE, "utf8");
    const finding = detectThinFetch(content);
    expect(finding).not.toBeNull();
    // "Show transcript" sits past the first 1,000 chars and must not be counted.
    expect(finding!.markers).toEqual(["That's an error", "Skip navigation", "Sign in"]);
  });

  it("returns null for a real article", () => {
    const article = [
      "Modern CSS gives us powerful new tools to build robust, dynamic interfaces.",
      "When it's easier than ever to build robust web experiences, what should you be building?",
    ].join("\n\n");
    expect(detectThinFetch(article)).toBeNull();
  });

  it("flags a Google error page, matching the U+2019 apostrophe", () => {
    const errorPage = "**401.** That\u2019s an error. The server cannot process the request because it is malformed.";
    const finding = detectThinFetch(errorPage);
    expect(finding?.markers).toEqual(["That's an error"]);
  });

  it("requires two-or-more of the weaker markers, not one", () => {
    // A single instance of quote-able UI copy must not trip the detector.
    expect(detectThinFetch("Please Sign in to continue.")).toBeNull();
    expect(detectThinFetch("The page says Skip navigation for keyboard users.")).toBeNull();

    // Two weaker markers together are enough.
    const finding = detectThinFetch("Skip navigation to main content. Sign in to your account.");
    expect(finding?.markers).toEqual(["Skip navigation", "Sign in"]);
  });

  it("ignores markers past the first 1,000 chars", () => {
    // A real article about error handling can legitimately contain those
    // strings deep in the body — only the opening ~1,000 chars are scoped.
    const padding = "A".repeat(1_100);
    const body = "\n\n" + padding + "\n\nThis article explains Skip navigation and Show transcript patterns.";
    expect(detectThinFetch(body)).toBeNull();
  });
});
