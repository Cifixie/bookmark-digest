import { describe, it, expect } from "vitest";
import { digestBlockSchema, catalog, type DigestBlock } from "../index";

describe("digestBlockSchema", () => {
  it("validates a Callout block", () => {
    const block = digestBlockSchema.parse({
      type: "Callout",
      props: { variant: "info", text: "Hello world" },
    });
    expect(block.type).toBe("Callout");
    expect(block.props.variant).toBe("info");
  });

  it("validates a TLDR block", () => {
    const block = digestBlockSchema.parse({
      type: "TLDR",
      props: { label: "Summary", points: ["point 1", "point 2"] },
    });
    expect(block.type).toBe("TLDR");
    expect(block.props.points).toHaveLength(2);
  });

  it("validates all 19 block types", () => {
    const allTypes: DigestBlock["type"][] = [
      "Callout", "Card", "ChecklistItem", "CodeBlock", "FaqItem",
      "Figure", "GlossaryTerm", "Grid", "LinkItem", "List",
      "NextSteps", "Prerequisites", "Prose", "ProsCons", "QuoteBlock",
      "StatCard", "Step", "Terminal", "TLDR",
    ];
    for (const type of allTypes) {
      const block = digestBlockSchema.parse({ type, props: {} });
      expect(block.type).toBe(type);
    }
  });

  it("rejects an unknown type", () => {
    expect(() =>
      digestBlockSchema.parse({ type: "UnknownBlock", props: {} })
    ).toThrow();
  });
});

describe("catalog", () => {
  it("generates prompt with all 19 content blocks", () => {
    const prompt = catalog.prompt();
    const allTypes: DigestBlock["type"][] = [
      "Callout", "Card", "ChecklistItem", "CodeBlock", "FaqItem",
      "Figure", "GlossaryTerm", "Grid", "LinkItem", "List",
      "NextSteps", "Prerequisites", "Prose", "ProsCons", "QuoteBlock",
      "StatCard", "Step", "Terminal", "TLDR",
    ];
    for (const type of allTypes) {
      expect(prompt).toContain(`- ${type}:`);
    }
  });

  it("does NOT include non-catalog items in prompt", () => {
    const prompt = catalog.prompt();
    expect(prompt).not.toContain("RelatedFromYourBookmarks");
    expect(prompt).not.toContain("MyNote");
  });
});
