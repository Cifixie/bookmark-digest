import { describe, it, expect } from "vitest";
import { validateDigestSpec, digestBlockProps } from "../index";

describe("validateDigestSpec", () => {
  /** Helper: build a minimal spec element with all required fields. */
  function el(type: string, props: Record<string, unknown>): Record<string, unknown> {
    return { type, props, children: [], visible: true };
  }

  it("accepts a valid Spec with correct props", () => {
    const spec = {
      root: "el-0",
      elements: {
        "el-0": el("TLDR", { points: ["Key insight 1", "Key insight 2"] }),
      },
    };
    const result = validateDigestSpec(spec);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects an element with empty props when props are required", () => {
    const spec = {
      root: "el-0",
      elements: {
        "el-0": el("Callout", {}), // variant and text are required
      },
    };
    const result = validateDigestSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    // Should mention the Callout type and missing fields
    const issuesStr = result.issues.join("; ");
    expect(issuesStr).toContain("Callout");
  });

  it("rejects an element with invalid variant", () => {
    const spec = {
      root: "el-0",
      elements: {
        "el-0": el("Callout", { variant: "invalid-variant", text: "Some text" }),
      },
    };
    const result = validateDigestSpec(spec);
    expect(result.valid).toBe(false);
  });

  it("reports issues for multiple invalid elements", () => {
    const spec = {
      root: "el-0",
      elements: {
        "el-0": el("TLDR", {}),
        "el-1": el("Callout", { variant: "info" }), // text is required
        "el-2": el("Card", {}), // title is required
      },
    };
    const result = validateDigestSpec(spec);
    expect(result.valid).toBe(false);
    // Should have issues for Callout (missing text) and Card (missing title)
    const issuesStr = result.issues.join("; ");
    expect(issuesStr).toContain("Callout");
    expect(issuesStr).toContain("Card");
  });

  it("checks that TLDR with default props is accepted", () => {
    // TLDR.props has defaults: label defaults to "TL;DR", points defaults to []
    const spec = {
      root: "el-0",
      elements: {
        "el-0": el("TLDR", {}),
      },
    };
    const result = validateDigestSpec(spec);
    // This should pass because TLDR has defaults for all required fields
    // Note: Zod defaults are only applied during .parse(), not .safeParse()
    // So empty props for TLDR will fail because Zod validates against the schema structure
    // (points defaults to [] but the schema still requires it to be present)
    // Actually, let me check: z.array(z.string()).default([]) means the property is still required in the schema
    // But Zod's safeParse on { points: [] } with schema z.object({ points: z.array(z.string()).default([]) })
    // will return success because the schema allows missing points (it has a default)
    expect(result.valid).toBe(true);
  });

  it("rejects an element missing the visible field (catalog.validate requires it)", () => {
    // Gemini treats `visible` as optional and often omits it — this spec
    // shape must fail so callers know to default it before validating.
    const spec = {
      root: "el-0",
      elements: {
        "el-0": { type: "TLDR", props: { points: ["a"] }, children: [] },
      },
    };
    const result = validateDigestSpec(spec);
    expect(result.valid).toBe(false);
  });

  it("checks digestBlockProps exports all 19 types", () => {
    const allTypes = [
      "Callout", "Card", "ChecklistItem", "CodeBlock", "FaqItem",
      "Figure", "GlossaryTerm", "Grid", "LinkItem", "List",
      "NextSteps", "Prerequisites", "Prose", "ProsCons", "QuoteBlock",
      "StatCard", "Step", "Terminal", "TLDR",
    ];
    for (const type of allTypes) {
      expect(digestBlockProps[type]).toBeDefined();
    }
  });
});
