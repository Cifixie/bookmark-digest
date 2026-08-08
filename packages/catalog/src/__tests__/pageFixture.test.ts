import { describe, it, expect } from "vitest";
import { digestBlockSchema, type DigestPage } from "../index";

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
          content: [
            { type: "TLDR", props: { points: ["Key insight 1", "Key insight 2"] } },
          ],
        },
        {
          heading: "Deep Dive",
          content: [
            { type: "Prose", props: { paragraphs: ["Some text here."] } },
            { type: "Callout", props: { variant: "tip", text: "Don't forget!" } },
          ],
        },
      ],
    };

    // Verify structure holds
    expect(page.source.kind).toBe("written");
    expect(page.sections).toHaveLength(2);
    expect(page.sections[0].content).toHaveLength(1);
    expect(page.sections[0].content[0].type).toBe("TLDR");
    expect(page.sections[1].content[1].type).toBe("Callout");

    // Each block validates against digestBlockSchema
    for (const section of page.sections) {
      for (const block of section.content) {
        const validated = digestBlockSchema.parse(block);
        expect(validated.type).toBe(block.type);
      }
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
          content: [
            { type: "TLDR", props: { points: ["Important points"] } },
          ],
        },
        {
          heading: "Key Quotes",
          content: [
            {
              type: "QuoteBlock",
              props: { quote: "The future is server components.", attribution: "Speaker A" },
            },
          ],
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
