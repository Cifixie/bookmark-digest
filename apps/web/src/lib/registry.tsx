/**
 * Registry that wires the catalog content blocks to React components.
 * Each block renders via json-render's <Renderer> with catalog-based prop types.
 */

import { defineRegistry } from "@json-render/react";
import { catalog, digestBlockProps } from "@bookmark-digest/catalog";
import { iterateComponents } from "./iterateComponents";
import { AuthorCard } from "../components/digestBlocks/AuthorCard/AuthorCard";
import { Callout } from "../components/digestBlocks/Callout/Callout";
import { Card } from "../components/digestBlocks/Card/Card";
import { Chart } from "../components/digestBlocks/Chart/Chart";
import { ChecklistItem } from "../components/digestBlocks/ChecklistItem/ChecklistItem";
import { CodeBlock } from "../components/digestBlocks/CodeBlock/CodeBlock";
import { ComparisonNarrative } from "../components/digestBlocks/ComparisonNarrative/ComparisonNarrative";
import { ComparisonTable } from "../components/digestBlocks/ComparisonTable/ComparisonTable";
import { FaqItem } from "../components/digestBlocks/FaqItem/FaqItem";
import { Figure } from "../components/digestBlocks/Figure/Figure";
import { GlossaryTerm } from "../components/digestBlocks/GlossaryTerm/GlossaryTerm";
import { Grid } from "../components/digestBlocks/Grid/Grid";
import { LinkItem } from "../components/digestBlocks/LinkItem/LinkItem";
import { List } from "../components/digestBlocks/List/List";
import { NextSteps } from "../components/digestBlocks/NextSteps/NextSteps";
import { Prerequisites } from "../components/digestBlocks/Prerequisites/Prerequisites";
import { Prose } from "../components/digestBlocks/Prose/Prose";
import { ProsCons } from "../components/digestBlocks/ProsCons/ProsCons";
import { PullQuote } from "../components/digestBlocks/PullQuote/PullQuote";
import { QuoteBlock } from "../components/digestBlocks/QuoteBlock/QuoteBlock";
import { SectionContainer } from "../components/digestBlocks/SectionContainer/SectionContainer";
import { StatCard } from "../components/digestBlocks/StatCard/StatCard";
import { Step } from "../components/digestBlocks/Step/Step";
import { Terminal } from "../components/digestBlocks/Terminal/Terminal";
import { TimelineEvent } from "../components/digestBlocks/TimelineEvent/TimelineEvent";
import { TLDR } from "../components/digestBlocks/TLDR/TLDR";

/** Raw block-type → component map — the single source of truth for what @bookmark-digest/catalog's block types render to. */
export const blockComponents = {
  AuthorCard,
  Callout,
  Card,
  Chart,
  ChecklistItem,
  CodeBlock,
  ComparisonNarrative,
  ComparisonTable,
  FaqItem,
  Figure,
  GlossaryTerm,
  Grid,
  LinkItem,
  List,
  NextSteps,
  Prerequisites,
  Prose,
  ProsCons,
  PullQuote,
  QuoteBlock,
  SectionContainer,
  StatCard,
  Step,
  Terminal,
  TimelineEvent,
  TLDR,
};

// Adding a block to the catalog without adding it here is invisible: the
// generator is told to emit the block, validation accepts it, and the page
// just renders nothing where it should be. TypeScript can't catch it because
// the catalog's block types are strings. Fail loudly at module load instead.
const unrendered = Object.keys(digestBlockProps).filter((type) => !(type in blockComponents));
if (unrendered.length > 0) {
  throw new Error(
    `Catalog block types with no renderer registered: ${unrendered.join(", ")}. ` +
      `Add a component under components/digestBlocks and register it in blockComponents.`,
  );
}

const components = iterateComponents(
  blockComponents,
  (Element) =>
    function Wrapped({ props, children }) {
      if (!children) return <Element {...props} />;
      return <Element {...props}>{children}</Element>;
    },
);

export const { registry } = defineRegistry(catalog, { components });
