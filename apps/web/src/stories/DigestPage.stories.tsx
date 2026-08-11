import type { Meta, StoryObj } from "@storybook/react";
import { DigestPage } from "../components/page/DigestPage";
import type { DigestPage as DigestPageType, Spec } from "@bookmark-digest/catalog";

const meta = {
  title: "Digest/Page",
  component: DigestPage,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DigestPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Helper: build a minimal Spec from an array of block definitions.
 * First block becomes root; auto-wrapped in SectionContainer if needed. */
function buildSpec(blocks: Array<{ type: string; props: Record<string, unknown> }>, rootType = "SectionContainer"): Spec {
  const elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }> = {};
  const contentKeys: string[] = [];
  blocks.forEach((b, i) => {
    const key = `el-${i}`;
    contentKeys.push(key);
    elements[key] = { type: b.type, props: b.props, children: [] };
  });
  const rootKey = rootType === "SectionContainer" ? "container" : contentKeys[0];
  if (rootType === "SectionContainer") {
    elements[rootKey] = { type: "SectionContainer", props: {}, children: contentKeys };
  }
  return { root: rootKey, elements };
}

const sampleWrittenPage: DigestPageType & {
  myNote?: { text: string; createdAt: string };
  relatedBookmarks?: { count: number };
} = {
  source: {
    kind: "written",
    author: "Jane Doe",
    publication: "TechBlog",
    publishDate: "2025-01-15T00:00:00Z",
    readingTimeMinutes: 10,
  },
  meta: {
    digestType: "article",
    tone: "conversational",
    length: "medium",
  },
  sections: [
    {
      heading: "TL;DR",
      spec: buildSpec([
        { type: "TLDR", props: { points: ["Key insight 1", "Key insight 2", "Key insight 3"] } },
      ]),
    },
    {
      heading: "Deep Dive",
      spec: buildSpec([
        { type: "Prose", props: { paragraphs: ["This is some body text explaining the core concepts in a digest. It flows naturally without any card chrome or background styling."] } },
        { type: "Callout", props: { variant: "tip", text: "Always validate your schemas before passing them to the LLM." } },
      ]),
    },
    {
      heading: "Code Example",
      spec: buildSpec([
        { type: "CodeBlock", props: { language: "typescript", code: "import { z } from 'zod';\n\nconst schema = z.object({ name: z.string() });", caption: "Schema definition" } },
      ]),
    },
  ],
};

export const WrittenArticle: Story = {
  args: {
    ...sampleWrittenPage,
  },
};

const sampleTemporalPage: DigestPageType & {
  myNote?: { text: string; createdAt: string };
  relatedBookmarks?: { count: number };
} = {
  source: {
    kind: "temporal",
    title: "React Server Components Deep Dive",
    showName: "TechTalks",
    duration: 1800,
    hasVideo: true,
    sourceLink: "https://youtube.com/watch?v=abc",
    chapters: [
      { timestampSeconds: 0, title: "Introduction" },
      { timestampSeconds: 600, title: "Core Concepts" },
      { timestampSeconds: 1200, title: "Live Demo" },
    ],
    speakers: [{ name: "Speaker A", role: "host" }],
  },
  meta: {
    digestType: "video",
    tone: "beginner-friendly",
    length: "long",
  },
  sections: [
    {
      heading: "Summary",
      spec: buildSpec([
        { type: "TLDR", props: { points: ["RSCs are a new paradigm", "Server components can't use hooks"] } },
      ]),
    },
    {
      heading: "Key Quotes",
      spec: buildSpec([
        { type: "QuoteBlock", props: { quote: "The future is server components.", attribution: "Speaker A" } },
      ]),
    },
  ],
};

export const TemporalVideo: Story = {
  args: {
    ...sampleTemporalPage,
  },
};
