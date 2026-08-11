// ---------------------------------------------------------------------------
// @bookmark-digest/catalog — main entry point
//
// Exports:
// - DigestBlock: a discriminated union of all LLM-authored content blocks
// - DigestPage: the full typed page tree
// - All re-exports from submodules (enums, sourceVariants, page, nonCatalog)
// ---------------------------------------------------------------------------

import { z } from "zod";

// --- Content block schemas (used to derive the DigestBlock union) ---
import * as Callout from "./digestBlocks/Callout.catalog";
import * as Card from "./digestBlocks/Card.catalog";
import * as ChecklistItem from "./digestBlocks/ChecklistItem.catalog";
import * as CodeBlock from "./digestBlocks/CodeBlock.catalog";
import * as FaqItem from "./digestBlocks/FaqItem.catalog";
import * as Figure from "./digestBlocks/Figure.catalog";
import * as GlossaryTerm from "./digestBlocks/GlossaryTerm.catalog";
import * as Grid from "./digestBlocks/Grid.catalog";
import * as LinkItem from "./digestBlocks/LinkItem.catalog";
import * as List from "./digestBlocks/List.catalog";
import * as NextSteps from "./digestBlocks/NextSteps.catalog";
import * as Prerequisites from "./digestBlocks/Prerequisites.catalog";
import * as Prose from "./digestBlocks/Prose.catalog";
import * as ProsCons from "./digestBlocks/ProsCons.catalog";
import * as QuoteBlock from "./digestBlocks/QuoteBlock.catalog";
import * as StatCard from "./digestBlocks/StatCard.catalog";
import * as Step from "./digestBlocks/Step.catalog";
import * as Terminal from "./digestBlocks/Terminal.catalog";
import * as TLDR from "./digestBlocks/TLDR.catalog";

// --- Source variants ---
export * from "./enums";
export * from "./sourceVariants";

// --- Page shell ---
export * from "./page";

// --- Digest block props map + validation ---
export { digestBlockProps } from "./digestBlockProps";
export { validateDigestSpec } from "./validateDigestSpec";
export { type Spec } from "@json-render/core";

// --- Non-catalog (standalone) schemas ---
export * from "./nonCatalog/RelatedFromYourBookmarks.schema";
export * from "./nonCatalog/MyNote.schema";

// --- Catalog composition (defineCatalog) ---
export { default as catalog } from "./catalog";

// --- Inline type refs ---
import type { SourceVariant } from "./sourceVariants";
import type { DigestMeta } from "./page/DigestMeta.schema";

// ---------------------------------------------------------------------------
// DigestBlock union — derived from the block prop schemas
//
// Each block is wrapped as { type: literal("<BlockName>"), props: <BlockProps> }.
// This is both strongly typed and shaped like a json-render element
// (minus children). Derive from the barrel to avoid drift.
// ---------------------------------------------------------------------------

type DigestBlockTypeLiteral =
  | "Callout"
  | "Card"
  | "ChecklistItem"
  | "CodeBlock"
  | "FaqItem"
  | "Figure"
  | "GlossaryTerm"
  | "Grid"
  | "LinkItem"
  | "List"
  | "NextSteps"
  | "Prerequisites"
  | "Prose"
  | "ProsCons"
  | "QuoteBlock"
  | "SectionContainer"
  | "StatCard"
  | "Step"
  | "Terminal"
  | "TLDR";

/**
 * The DigestBlock union — all LLM-authored content blocks.
 * Each block is { type: "<BlockName>", props: <BlockProps> }.
 * Kept for the standalone per-block discriminator (digestBlockSchema);
 * DigestSection itself now holds a json-render Spec tree, not DigestBlock[].
 */
export type DigestBlock = {
  type: DigestBlockTypeLiteral;
  props: Record<string, unknown>;
};

/**
 * Runtime discriminator for DigestBlock — validates that an object is a
 * valid DigestBlock with known type + matching props schema.
 */
export const digestBlockSchema = z.object({
  type: z.enum([
    "Callout",
    "Card",
    "ChecklistItem",
    "CodeBlock",
    "FaqItem",
    "Figure",
    "GlossaryTerm",
    "Grid",
    "LinkItem",
    "List",
    "NextSteps",
    "Prerequisites",
    "Prose",
    "ProsCons",
    "QuoteBlock",
    "SectionContainer",
    "StatCard",
    "Step",
    "Terminal",
    "TLDR",
  ]),
  props: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// DigestPage — the full typed page tree (json-render Spec format)
// ---------------------------------------------------------------------------

import type { Spec } from "@json-render/core";

/** DigestPage section — a titled section with a json-render Spec tree. */
export interface DigestSection {
  /** Section heading (e.g. "Key Takeaways", "Background"). */
  heading: string;
  /** Optional descriptive subtitle. */
  subtitle?: string | null;
  /** Anchor ID for deep-linking to this section. */
  anchorId?: string;
  /** json-render Spec tree for this section. */
  spec: Spec;
}

/**
 * The complete DigestPage shape.
 * Uses json-render's native tree Spec format — each section contains a
 * compiled Spec with keyed elements and children references.
 */
export interface DigestPage {
  /** Where the digest came from (written article or temporal media). */
  source: SourceVariant;
  /** AI-generated metadata about the digest. */
  meta: DigestMeta;
  /** Content sections, each with a heading and a json-render Spec tree. */
  sections: DigestSection[];
  /** Optional accent color for theming the page. */
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Export all component prop types for renderer use
// ---------------------------------------------------------------------------

export type { CalloutProps } from "./digestBlocks/Callout.catalog";
export type { CardProps } from "./digestBlocks/Card.catalog";
export type { ChecklistItemProps } from "./digestBlocks/ChecklistItem.catalog";
export type { CodeBlockProps } from "./digestBlocks/CodeBlock.catalog";
export type { FaqItemProps } from "./digestBlocks/FaqItem.catalog";
export type { FigureProps } from "./digestBlocks/Figure.catalog";
export type { GlossaryTermProps } from "./digestBlocks/GlossaryTerm.catalog";
export type { GridProps } from "./digestBlocks/Grid.catalog";
export type { LinkItemProps } from "./digestBlocks/LinkItem.catalog";
export type { ListProps } from "./digestBlocks/List.catalog";
export type { NextStepsProps } from "./digestBlocks/NextSteps.catalog";
export type { PrerequisitesProps } from "./digestBlocks/Prerequisites.catalog";
export type { ProseProps } from "./digestBlocks/Prose.catalog";
export type { ProsConsProps } from "./digestBlocks/ProsCons.catalog";
export type { QuoteBlockProps } from "./digestBlocks/QuoteBlock.catalog";
export type { SectionContainerProps } from "./digestBlocks/SectionContainer.catalog";
export type { StatCardProps } from "./digestBlocks/StatCard.catalog";
export type { StepProps } from "./digestBlocks/Step.catalog";
export type { TerminalProps } from "./digestBlocks/Terminal.catalog";
export type { TLDRProps } from "./digestBlocks/TLDR.catalog";
