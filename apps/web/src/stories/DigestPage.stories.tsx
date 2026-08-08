import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DigestPage } from "../../components/page/DigestPage";
import type { DigestPage as DigestPageType } from "@bookmark-digest/catalog";

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
      content: [
        { type: "TLDR", props: { points: ["Key insight 1", "Key insight 2", "Key insight 3"] } },
      ],
    },
    {
      heading: "Deep Dive",
      content: [
        { type: "Prose", props: { paragraphs: ["This is some body text explaining the core concepts in a digest. It flows naturally without any card chrome or background styling."] } },
        { type: "Callout", props: { variant: "tip", text: "Always validate your schemas before passing them to the LLM." } },
      ],
    },
    {
      heading: "Code Example",
      content: [
        { type: "CodeBlock", props: { language: "typescript", code: "import { z } from 'zod';\n\nconst schema = z.object({ name: z.string() });", caption: "Schema definition" } },
      ],
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
      content: [
        { type: "TLDR", props: { points: ["RSCs are a new paradigm", "Server components can't use hooks"] } },
      ],
    },
    {
      heading: "Key Quotes",
      content: [
        { type: "QuoteBlock", props: { quote: "The future is server components.", attribution: "Speaker A" } },
      ],
    },
  ],
};

export const TemporalVideo: Story = {
  args: {
    ...sampleTemporalPage,
  },
};
