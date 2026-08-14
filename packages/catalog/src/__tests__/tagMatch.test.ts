import { describe, it, expect } from "vitest";
import { levenshtein, normalizeTag, matchTag } from "../lib/tagMatch";

describe("levenshtein", () => {
  it("same strings have distance 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("empty string distance", () => {
    expect(levenshtein("", "hello")).toBe(5);
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "")).toBe(0);
  });

  it("single character edit", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("multiple edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("css", "canvas")).toBe(4);
  });
});

describe("normalizeTag", () => {
  it("lowercases", () => {
    expect(normalizeTag("CSS")).toBe("css");
    expect(normalizeTag("HTML")).toBe("html");
  });

  it("trims whitespace", () => {
    expect(normalizeTag("  React  ")).toBe("react");
  });

  it("strips punctuation", () => {
    expect(normalizeTag("C++")).toBe("c");
    expect(normalizeTag("go!")).toBe("go");
  });

  it("collapses whitespace", () => {
    expect(normalizeTag("  Design   Systems  ")).toBe("design systems");
  });

  it("preserves hyphens", () => {
    expect(normalizeTag("web-components")).toBe("web-components");
  });

  it("handles AI/ML acronyms", () => {
    // Slash is punctuation → stripped: "AI/ML" → "aiml"
    expect(normalizeTag("AI/ML")).toBe("aiml");
    expect(normalizeTag("IaC")).toBe("iac");
  });
});

describe("matchTag", () => {
  const existingTags = [
    { displayTag: "React" },
    { displayTag: "TypeScript" },
    { displayTag: "Design Systems" },
    { displayTag: "CSS" },
    { displayTag: "JavaScript" },
  ];

  it("exact normalized match returns canonical", () => {
    const result = matchTag("react", existingTags);
    expect(result.canonical).toBe("React");
    expect(result.fuzzy).toBe(false);
  });

  it("exact normalized match returns canonical for uppercase input", () => {
    const result = matchTag("TYPESCRIPT", existingTags);
    expect(result.canonical).toBe("TypeScript");
    expect(result.fuzzy).toBe(false);
  });

  it("normalization makes case-insensitive match exact", () => {
    // "Css" → "css" matches "CSS" normalized → "css" exactly
    const result = matchTag("Css", existingTags);
    expect(result.canonical).toBe("CSS");
    expect(result.fuzzy).toBe(false);
  });

  it("new tag returns itself as canonical", () => {
    const result = matchTag("GoLang", existingTags);
    expect(result.canonical).toBe("GoLang");
    expect(result.fuzzy).toBe(false);
  });

  it("skips fuzzy matching for short tags (< 4 chars)", () => {
    const withAI = [...existingTags, { displayTag: "AI/ML" }];
    const result = matchTag("ai", withAI);
    // "ai" normalized vs "ai/ml" normalized — these don't match exactly
    // and fuzzy is skipped for short tags, so it returns "ai"
    expect(result.canonical).toBe("ai");
    expect(result.fuzzy).toBe(false);
  });

  it("fuzzy match for plural/singular", () => {
    const withButtons = [...existingTags, { displayTag: "Buttons" }];
    const result = matchTag("button", withButtons);
    // "button" vs "buttons" - edit distance 1 (just the 's')
    expect(result.canonical).toBe("Buttons");
    expect(result.fuzzy).toBe(true);
  });
});
