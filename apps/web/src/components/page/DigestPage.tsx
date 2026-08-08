import type { DigestPage as DigestPageType } from "@bookmark-digest/catalog";
import { DigestHero } from "./DigestHero";
import { SourceMeta } from "./SourceMeta";
import { DigestFooter } from "./DigestFooter";
import { registry } from "../../lib/registry";

// Placeholder renderers for non-catalog sections
const RelatedFromYourBookmarks = () => (
  <div style={{
    borderTop: "1px solid #e0e0e0",
    paddingTop: 20,
    marginTop: 24,
  }}>
    <h3 style={{ margin: "0 0 12px", color: "#333" }}>Related from your bookmarks</h3>
    <p style={{ color: "#888" }}>— (placeholder for pgvector retrieval) —</p>
  </div>
);

const MyNote = ({ text }: { text: string }) => (
  <div style={{
    border: "1px solid #e0e0e0",
    borderLeft: "4px solid #1a73e8",
    padding: "12px 16px",
    margin: "16px 0",
    background: "#f0f7ff",
    borderRadius: "0 8px 8px 0",
  }}>
    <strong style={{ color: "#1a73e8" }}>📝 My note:</strong>
    <p style={{ margin: "4px 0 0", color: "#444", lineHeight: 1.6 }}>{text}</p>
  </div>
);

// Type for component registry index
type ComponentMap = Record<string, (props: any) => any>;
const componentMap = registry as unknown as ComponentMap;

// Simple block renderer — renders a single DigestBlock using the registry
const BlockRenderer = ({ type, props }: { type: string; props: Record<string, unknown> }) => {
  const Component = componentMap[type];
  if (!Component) return <div style={{ padding: 12, color: "#999" }}>[Unknown block: {type}]</div>;
  return <Component props={props} />;
};

export const DigestPage = ({ source, meta, sections, accentColor, myNote, relatedBookmarks }: DigestPageType & {
  myNote?: { text: string; createdAt: string };
  relatedBookmarks?: { count: number };
}) => (
  <article style={{
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#222",
    lineHeight: 1.6,
  }}>
    <DigestHero
      source={source}
      title={meta.digestType === "article" ? "Digest Title Placeholder" : meta.digestType === "video" ? "Video Digest" : "Digest"}
      subtitle={meta.tone}
    />
    <SourceMeta
      kind={source.kind}
      author={source.kind === "written" ? source.author : source.title}
      publication={source.kind === "written" ? source.publication : source.showName}
      publishDate={source.kind === "written" ? source.publishDate : undefined}
      readingTimeMinutes={source.kind === "written" ? source.readingTimeMinutes : undefined}
      healthStatus={source.kind === "written" ? source.healthStatus : undefined}
    />
    {sections.map((section, i) => (
      <section key={i} style={{ margin: "24px 0" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "#222" }}>{section.heading}</h2>
        {section.subtitle && <p style={{ margin: "0 0 16px", color: "#888" }}>{section.subtitle}</p>}
        {section.content.map((block, j) => (
          <BlockRenderer key={j} type={block.type} props={block.props} />
        ))}
      </section>
    ))}
    {relatedBookmarks && <RelatedFromYourBookmarks />}
    {myNote && <MyNote text={myNote.text} />}
    <DigestFooter />
  </article>
);
