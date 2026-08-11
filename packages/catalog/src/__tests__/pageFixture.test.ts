import { describe, it, expect } from "vitest";
import { type Spec } from "@json-render/core";
import { type DigestPage } from "../index";

/** Helper: build a minimal Spec from an array of DigestBlock-like objects. */
function buildSpec(blocks: Array<{ type: string; props: Record<string, unknown> }>): Spec {
  const elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }> = {};
  blocks.forEach((b, i) => {
    elements[`el-${i}`] = { type: b.type, props: b.props, children: [] };
  });
  const root = blocks.length > 0 ? "el-0" : "";
  return { root, elements };
}

describe("DigestPage fixture", () => {
  it("parses a valid written DigestPage", () => {
    const page: DigestPage = {
      source: {
        kind: "written",
        author: "Jane Doe",
        publication: "TechBlog",
        publishDate: "2025-01-15T00:00:00Z",
        readingTimeMinutes: 10,
      },
      meta: {
        digestType: "article",
        tone: "conversational",
        length: "medium",
      },
      sections: [
        {
          heading: "TL;DR",
          spec: buildSpec([
            { type: "TLDR", props: { points: ["Key insight 1", "Key insight 2"] } },
          ]),
        },
        {
          heading: "Deep Dive",
          spec: buildSpec([
            { type: "Prose", props: { paragraphs: ["Some text here."] } },
            { type: "Callout", props: { variant: "tip", text: "Don't forget!" } },
          ]),
        },
      ],
    };

    // Verify structure holds
    expect(page.source.kind).toBe("written");
    expect(page.sections).toHaveLength(2);
    expect(page.sections[0].spec.elements).toHaveProperty("el-0");
    expect(page.sections[0].spec.elements["el-0"].type).toBe("TLDR");
    expect(page.sections[1].spec.elements["el-1"].type).toBe("Callout");

    // Specs are valid Spec shapes
    for (const section of page.sections) {
      expect(section.spec).toHaveProperty("root");
      expect(section.spec).toHaveProperty("elements");
      expect(Object.keys(section.spec?.elements ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("parses a valid temporal DigestPage", () => {
    const page: DigestPage = {
      source: {
        kind: "temporal",
        title: "React Conf 2025",
        showName: "YouTube",
        hasVideo: true,
        sourceLink: "https://youtube.com/watch?v=abc",
        chapters: [
          { timestampSeconds: 0, title: "Opening" },
          { timestampSeconds: 600, title: "Keynotes" },
        ],
        speakers: [{ name: "Speaker A", role: "host" }],
      },
      meta: {
        digestType: "video",
        tone: "beginner-friendly",
        length: "long",
      },
      sections: [
        {
          heading: "Summary",
          spec: buildSpec([
            { type: "TLDR", props: { points: ["Important points"] } },
          ]),
        },
        {
          heading: "Key Quotes",
          spec: buildSpec([
            {
              type: "QuoteBlock",
              props: { quote: "The future is server components.", attribution: "Speaker A" },
            },
          ]),
        },
      ],
    };

    expect(page.source.kind).toBe("temporal");
    if (page.source.kind === "temporal") {
      expect(page.source.chapters).toHaveLength(2);
      expect(page.source.speakers).toHaveLength(1);
    }
  });
});
