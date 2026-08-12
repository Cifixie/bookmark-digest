// ---------------------------------------------------------------------------
// Per-type props maps — a Record<DigestBlockTypeLiteral, ZodType> for
// strict props validation that neither digestBlockSchema nor
// catalog.zodSchema() provides on its own (the latter falls back to
// z.record(z.unknown()) for catalogs with >1 component).
// ---------------------------------------------------------------------------

import { z } from "zod";
import * as AuthorCard from "./digestBlocks/AuthorCard.catalog";
import * as Callout from "./digestBlocks/Callout.catalog";
import * as Card from "./digestBlocks/Card.catalog";
import * as Chart from "./digestBlocks/Chart.catalog";
import * as ChecklistItem from "./digestBlocks/ChecklistItem.catalog";
import * as CodeBlock from "./digestBlocks/CodeBlock.catalog";
import * as ComparisonTable from "./digestBlocks/ComparisonTable.catalog";
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
import * as PullQuote from "./digestBlocks/PullQuote.catalog";
import * as QuoteBlock from "./digestBlocks/QuoteBlock.catalog";
import * as SectionContainer from "./digestBlocks/SectionContainer.catalog";
import * as StatCard from "./digestBlocks/StatCard.catalog";
import * as Step from "./digestBlocks/Step.catalog";
import * as Terminal from "./digestBlocks/Terminal.catalog";
import * as TimelineEvent from "./digestBlocks/TimelineEvent.catalog";
import * as TLDR from "./digestBlocks/TLDR.catalog";

/** Maps each DigestBlock type literal to its Zod props schema. */
export const digestBlockProps: Record<string, z.ZodType> = {
  AuthorCard: AuthorCard.props,
  Callout: Callout.props,
  Card: Card.props,
  Chart: Chart.props,
  ChecklistItem: ChecklistItem.props,
  CodeBlock: CodeBlock.props,
  ComparisonTable: ComparisonTable.props,
  FaqItem: FaqItem.props,
  Figure: Figure.props,
  GlossaryTerm: GlossaryTerm.props,
  Grid: Grid.props,
  LinkItem: LinkItem.props,
  List: List.props,
  NextSteps: NextSteps.props,
  Prerequisites: Prerequisites.props,
  Prose: Prose.props,
  ProsCons: ProsCons.props,
  PullQuote: PullQuote.props,
  QuoteBlock: QuoteBlock.props,
  SectionContainer: SectionContainer.props,
  StatCard: StatCard.props,
  Step: Step.props,
  Terminal: Terminal.props,
  TimelineEvent: TimelineEvent.props,
  TLDR: TLDR.props,
};
