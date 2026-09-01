import type { DigestPage as DigestPageType } from "@bookmark-digest/catalog";
import { Renderer } from "@json-render/react";
import { DigestHero } from "./DigestHero";
import { SourceMeta } from "./SourceMeta";
import { DigestFooter } from "./DigestFooter";
import { registry } from "../../lib/registry";

import { Link } from "react-router-dom";

// Real RelatedFromYourBookmarks renderer — powered by the /sources/{sourceHash}/related endpoint
interface RelatedSourceRow {
  contentHash: string;
  url: string;
  contentType: string;
  fetchedAt: string;
  title: string | null;
  score: number;
}

const RelatedFromYourBookmarks = ({ items }: { items: RelatedSourceRow[] }) => {
  const fallbackTitle = (url: string) => {
    try {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.split("/").pop() ?? url).slice(0, 80);
    } catch {
      return url.slice(0, 80);
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-light)",
        marginTop: 24,
        paddingTop: 16,
        padding: "0 8px",
      }}
    >
      <h3 style={{ margin: "0 0 12px", color: "var(--text-heading)", fontSize: 14 }}>
        Related from your bookmarks
      </h3>
      {items.map((item) => (
        <Link
          key={item.contentHash}
          to={`/sources/${item.contentHash}`}
          style={{
            display: "block",
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--bg-muted)",
            marginBottom: 6,
            textDecoration: "none",
            color: "inherit",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title ?? fallbackTitle(item.url)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {item.contentType} · {new Date(item.fetchedAt).toLocaleDateString()}
          </div>
        </Link>
      ))}
    </div>
  );
};


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
  relatedBookmarks?: RelatedSourceRow[];
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
    {relatedBookmarks && <RelatedFromYourBookmarks items={relatedBookmarks} />}
    {myNote && <MyNote text={myNote.text} />}
    <DigestFooter />
  </article>
);
