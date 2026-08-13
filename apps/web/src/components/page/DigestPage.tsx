import type { DigestPage as DigestPageType } from "@bookmark-digest/catalog";
import { Renderer } from "@json-render/react";
import { DigestHero } from "./DigestHero";
import { SourceMeta } from "./SourceMeta";
import { DigestFooter } from "./DigestFooter";
import { registry } from "../../lib/registry";

// Placeholder renderers for non-catalog sections
const RelatedFromYourBookmarks = () => (
  <div
    style={{
      borderTop: "1px solid var(--border-light)",
      paddingTop: 20,
      marginTop: 24,
    }}
  >
    <h3 style={{ margin: "0 0 12px", color: "var(--text-heading)" }}>
      Related from your bookmarks
    </h3>
    <p style={{ color: "var(--text-muted)" }}>— (placeholder for pgvector retrieval) —</p>
  </div>
);

const MyNote = ({ text }: { text: string }) => (
  <div
    style={{
      border: "1px solid var(--border-light)",
      borderLeft: "4px solid var(--brand-blue)",
      padding: "12px 16px",
      margin: "16px 0",
      background: "var(--bg-selected)",
      borderRadius: "0 8px 8px 0",
    }}
  >
    <strong style={{ color: "var(--brand-blue)" }}>📝 My note:</strong>
    <p style={{ margin: "4px 0 0", color: "var(--text-primary)", lineHeight: 1.6 }}>{text}</p>
  </div>
);

export const DigestPage = ({
  source,
  meta,
  sections,
  accentColor,
  myNote,
  relatedBookmarks,
}: DigestPageType & {
  myNote?: { text: string; createdAt: string };
  relatedBookmarks?: { count: number };
}) => (
  <article
    style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "24px 16px",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      color: "var(--text-primary)",
      lineHeight: 1.6,
    }}
  >
    <DigestHero
      source={source}
      title={
        meta.digestType === "article"
          ? "Digest Title Placeholder"
          : meta.digestType === "video"
            ? "Video Digest"
            : "Digest"
      }
      subtitle={meta.tone}
    />
    <SourceMeta
      kind={source.kind}
      author={source.kind === "written" ? source.author : source.title}
      publication={
        source.kind === "written" ? source.publication : source.showName
      }
      publishDate={source.kind === "written" ? source.publishDate : undefined}
      readingTimeMinutes={
        source.kind === "written" ? source.readingTimeMinutes : undefined
      }
      healthStatus={source.kind === "written" ? source.healthStatus : undefined}
    />
    {sections.map((section, i) => (
      <section key={i} style={{ margin: "24px 0" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "var(--text-heading)" }}>
          {section.heading}
        </h2>
        {section.subtitle && (
          <p style={{ margin: "0 0 16px", color: "var(--text-muted)" }}>
            {section.subtitle}
          </p>
        )}
        <Renderer spec={section.spec} registry={registry as any} />
      </section>
    ))}
    {relatedBookmarks && <RelatedFromYourBookmarks />}
    {myNote && <MyNote text={myNote.text} />}
    <DigestFooter />
  </article>
);
