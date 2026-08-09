/**
 * Registry that wires the catalog content blocks to React components.
 * Each block renders via json-render's <Renderer> with catalog-based prop types.
 */

import { defineRegistry } from "@json-render/react";
import { catalog } from "@bookmark-digest/catalog";
import { iterateComponents } from "./iterateComponents";
import { Callout } from "../components/digestBlocks/Callout/Callout";
import { Card } from "../components/digestBlocks/Card/Card";
import { ChecklistItem } from "../components/digestBlocks/ChecklistItem/ChecklistItem";
import { CodeBlock } from "../components/digestBlocks/CodeBlock/CodeBlock";
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
import { QuoteBlock } from "../components/digestBlocks/QuoteBlock/QuoteBlock";
import { StatCard } from "../components/digestBlocks/StatCard/StatCard";
import { Step } from "../components/digestBlocks/Step/Step";
import { Terminal } from "../components/digestBlocks/Terminal/Terminal";
import { TLDR } from "../components/digestBlocks/TLDR/TLDR";

const components = iterateComponents(
  {
    Callout,
    Card,
    ChecklistItem,
    CodeBlock,
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
    QuoteBlock,
    StatCard,
    Step,
    Terminal,
    TLDR,
  },
  (Element) =>
    function Wrapped({ props, children }) {
      if (!children) return <Element {...props} />;
      return <Element {...props}>{children}</Element>;
    },
);

export const registry = defineRegistry(catalog, { components });
