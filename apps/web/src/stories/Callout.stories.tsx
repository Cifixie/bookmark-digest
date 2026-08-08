import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Callout } from "../../components/digestBlocks/Callout/Callout";
import type { CalloutProps } from "@bookmark-digest/catalog";

const meta = {
  title: "Digest Blocks/Callout",
  component: Callout,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: [
        "info",
        "tip",
        "warning",
        "success",
        "note",
        "analogy",
        "big-idea",
        "takeaway",
        "why-it-matters",
        "misconception",
      ],
    },
    title: { control: "text" },
    text: { control: "text" },
  },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "info",
    text: "This is a callout box with default variant styling.",
  },
};

export const Tip: Story = {
  args: {
    variant: "tip",
    title: "Pro Tip",
    text: "Use CSS Modules for scoped styling in Next.js 16 — no new dependency needed.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    text: "This is a warning callout. Be careful with this configuration.",
  },
};

export const Misconception: Story = {
  args: {
    variant: "misconception",
    title: "Common Misconception",
    text: "You don't need a custom defineCatalog for every component. Use the shared catalog with discriminated unions.",
  },
};

export const BigIdea: Story = {
  args: {
    variant: "big-idea",
    title: "The Big Idea",
    text: "A two-axis schema model (source-variant + digest-block) keeps the catalog typed, testable, and LLM-friendly.",
  },
};
