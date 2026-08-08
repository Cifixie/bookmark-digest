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
import * as Callout from "./digestBlocks/Callout/Callout.catalog";
import * as Card from "./digestBlocks/Card/Card.catalog";
import * as ChecklistItem from "./digestBlocks/ChecklistItem/ChecklistItem.catalog";
import * as CodeBlock from "./digestBlocks/CodeBlock/CodeBlock.catalog";
import * as FaqItem from "./digestBlocks/FaqItem/FaqItem.catalog";
import * as Figure from "./digestBlocks/Figure/Figure.catalog";
import * as GlossaryTerm from "./digestBlocks/GlossaryTerm/GlossaryTerm.catalog";
import * as Grid from "./digestBlocks/Grid/Grid.catalog";
import * as LinkItem from "./digestBlocks/LinkItem/LinkItem.catalog";
import * as List from "./digestBlocks/List/List.catalog";
import * as NextSteps from "./digestBlocks/NextSteps/NextSteps.catalog";
import * as Prerequisites from "./digestBlocks/Prerequisites/Prerequisites.catalog";
import * as Prose from "./digestBlocks/Prose/Prose.catalog";
import * as ProsCons from "./digestBlocks/ProsCons/ProsCons.catalog";
import * as QuoteBlock from "./digestBlocks/QuoteBlock/QuoteBlock.catalog";
import * as StatCard from "./digestBlocks/StatCard/StatCard.catalog";
import * as Step from "./digestBlocks/Step/Step.catalog";
import * as Terminal from "./digestBlocks/Terminal/Terminal.catalog";
import * as TLDR from "./digestBlocks/TLDR/TLDR.catalog";

// --- Source variants ---
export * from "./enums";
export * from "./sourceVariants";

// --- Page shell ---
export * from "./page";

// --- Non-catalog (standalone) schemas ---
export * from "./nonCatalog/RelatedFromYourBookmarks.schema";
export * from "./nonCatalog/MyNote.schema";

// --- Catalog composition (defineCatalog) ---
export { default as catalog } from "./catalog";

// --- Inline type refs ---
import type { SourceVariant } from "./sourceVariants";
import type { DigestMeta } from "./page/DigestMeta/DigestMeta.schema";

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
  | "StatCard"
  | "Step"
  | "Terminal"
  | "TLDR";

/**
 * The DigestBlock union — all LLM-authored content blocks.
 * Each block is { type: "<BlockName>", props: <BlockProps> }.
 * Used in DigestSection.content: DigestBlock[].
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
    "StatCard",
    "Step",
    "Terminal",
    "TLDR",
  ]),
  props: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// DigestPage — the full typed page tree
// ---------------------------------------------------------------------------

/**
 * The complete DigestPage shape.
 * Flattened (not a json-render spec) — the page shell renderer maps this
 * to React components directly.
 */
export interface DigestPage {
  /** Where the digest came from (written article or temporal media). */
  source: SourceVariant;
  /** AI-generated metadata about the digest. */
  meta: DigestMeta;
  /** Content sections, each with a heading and an array of DigestBlocks. */
  sections: Array<{
    heading: string;
    subtitle?: string | null;
    anchorId?: string;
    content: DigestBlock[];
  }>;
  /** Optional accent color for theming the page. */
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Export all component prop types for renderer use
// ---------------------------------------------------------------------------

export type { CalloutProps } from "./digestBlocks/Callout/Callout.catalog";
export type { CardProps } from "./digestBlocks/Card/Card.catalog";
export type { ChecklistItemProps } from "./digestBlocks/ChecklistItem/ChecklistItem.catalog";
export type { CodeBlockProps } from "./digestBlocks/CodeBlock/CodeBlock.catalog";
export type { FaqItemProps } from "./digestBlocks/FaqItem/FaqItem.catalog";
export type { FigureProps } from "./digestBlocks/Figure/Figure.catalog";
export type { GlossaryTermProps } from "./digestBlocks/GlossaryTerm/GlossaryTerm.catalog";
export type { GridProps } from "./digestBlocks/Grid/Grid.catalog";
export type { LinkItemProps } from "./digestBlocks/LinkItem/LinkItem.catalog";
export type { ListProps } from "./digestBlocks/List/List.catalog";
export type { NextStepsProps } from "./digestBlocks/NextSteps/NextSteps.catalog";
export type { PrerequisitesProps } from "./digestBlocks/Prerequisites/Prerequisites.catalog";
export type { ProseProps } from "./digestBlocks/Prose/Prose.catalog";
export type { ProsConsProps } from "./digestBlocks/ProsCons/ProsCons.catalog";
export type { QuoteBlockProps } from "./digestBlocks/QuoteBlock/QuoteBlock.catalog";
export type { StatCardProps } from "./digestBlocks/StatCard/StatCard.catalog";
export type { StepProps } from "./digestBlocks/Step/Step.catalog";
export type { TerminalProps } from "./digestBlocks/Terminal/Terminal.catalog";
export type { TLDRProps } from "./digestBlocks/TLDR/TLDR.catalog";
