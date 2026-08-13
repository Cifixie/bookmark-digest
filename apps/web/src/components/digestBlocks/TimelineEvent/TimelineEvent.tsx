import type { TimelineEventProps } from "@bookmark-digest/catalog";

/** `date` is a model-authored ISO-ish string; show it raw if it won't parse. */
function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const TimelineEvent = (props: TimelineEventProps) => {
  const { items, narrative } = props;
  // The schema documents items as chronological but doesn't enforce it, and
  // the whole point of the block is the arc — so sort here rather than trust it.
  const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div style={{ margin: "12px 0" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, borderLeft: "2px solid var(--border-primary)" }}>
        {ordered.map((item, i) => (
          <li key={i} style={{ position: "relative", padding: "0 0 20px 20px" }}>
            <span
              style={{
                position: "absolute",
                left: -6,
                top: 4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--brand-blue)",
              }}
            />
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{formatDate(item.date)}</div>
            <div style={{ fontWeight: 600, color: "var(--text-heading)", fontSize: 14 }}>{item.label}</div>
            <p style={{ margin: "4px 0 0", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>{item.text}</p>
          </li>
        ))}
      </ol>
      {narrative && (
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 13, fontStyle: "italic" }}>{narrative}</p>
      )}
    </div>
  );
};
