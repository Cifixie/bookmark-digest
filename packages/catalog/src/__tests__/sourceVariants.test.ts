import { describe, it, expect } from "vitest";
import { sourceVariantSchema } from "../sourceVariants";
import type { SourceVariant } from "../sourceVariants";

describe("sourceVariantSchema", () => {
  it("validates a written source", () => {
    const source = sourceVariantSchema.parse({
      kind: "written",
      author: "Jane Doe",
      publication: "TechBlog",
      publishDate: "2025-01-15T00:00:00Z",
      readingTimeMinutes: 5,
    });
    expect(source.kind).toBe("written");
    expect((source as any).author).toBe("Jane Doe");
  });

  it("validates a temporal source", () => {
    const source = sourceVariantSchema.parse({
      kind: "temporal",
      title: "How React Server Components Work",
      showName: "TechTalks",
      duration: 1800,
      hasVideo: true,
      sourceLink: "https://example.com/video",
    });
    expect(source.kind).toBe("temporal");
    expect((source as any).hasVideo).toBe(true);
  });

  it("validates temporal source with chapters and speakers", () => {
    const source = sourceVariantSchema.parse({
      kind: "temporal",
      title: "Advanced TypeScript",
      showName: "CodeCast",
      hasVideo: true,
      sourceLink: "https://example.com/podcast",
      chapters: [{ timestampSeconds: 0, title: "Intro" }],
      speakers: [{ name: "John", role: "host" }],
    });
    expect((source as any).chapters).toHaveLength(1);
    expect((source as any).speakers).toHaveLength(1);
  });

  it("rejects an invalid kind", () => {
    expect(() =>
      sourceVariantSchema.parse({
        kind: "audio" as unknown as SourceVariant["kind"],
        author: "Nobody",
        publication: "Nowhere",
      })
    ).toThrow();
  });
});
