import type { SourceVariant } from "@bookmark-digest/catalog";

const WrittenHero = ({ author, publication, publishDate, readingTimeMinutes }: {
  author: string;
  publication: string;
  publishDate?: string;
  readingTimeMinutes?: number;
}) => (
  <div style={{ marginBottom: 20 }}>
    {publication && <div style={{ fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>{publication}</div>}
    <h2 style={{ margin: "8px 0 4px", color: "#555", fontSize: 18 }}>by {author}</h2>
    {publishDate && <div style={{ fontSize: 14, color: "#888" }}>{publishDate}</div>}
    {readingTimeMinutes && <div style={{ fontSize: 14, color: "#888" }}>{readingTimeMinutes} min read</div>}
  </div>
);

const TemporalHero = ({ title, showName, duration, hasVideo, chapters }: {
  title: string;
  showName: string;
  duration?: number;
  hasVideo: boolean;
  chapters?: { timestampSeconds: number; title: string }[];
}) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>{showName}</div>
    <h2 style={{ margin: "8px 0 4px", color: "#555", fontSize: 18 }}>{title}</h2>
    <div style={{ display: "flex", gap: 16, fontSize: 14, color: "#888" }}>
      {hasVideo && <span>📹 Video</span>}
      {duration && <span>⏱ {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}</span>}
    </div>
    {chapters && chapters.length > 0 && (
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, color: "#555" }}>Chapters</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          {chapters.map((ch, i) => (
            <li key={i} style={{ marginBottom: 2, fontSize: 13, color: "#666" }}>
              {Math.floor(ch.timestampSeconds / 60)}:{String(ch.timestampSeconds % 60).padStart(2, "0")} — {ch.title}
            </li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

export const DigestHero = ({ source, title, subtitle }: {
  source: SourceVariant;
  title: string;
  subtitle?: string | null;
}) => (
  <div>
    <h1 style={{ margin: "0 0 12px", fontSize: 28, color: "#111" }}>{title}</h1>
    {subtitle && <p style={{ margin: 0, fontSize: 16, color: "#666" }}>{subtitle}</p>}
    {source.kind === "written" ? (
      <WrittenHero {...source} />
    ) : (
      <TemporalHero
        title={source.title}
        showName={source.showName}
        duration={source.duration}
        hasVideo={source.hasVideo}
        chapters={source.chapters}
      />
    )}
  </div>
);
