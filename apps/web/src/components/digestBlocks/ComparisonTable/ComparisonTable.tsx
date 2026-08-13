import type { ComparisonTableProps } from "@bookmark-digest/catalog";

const winnerBackground = "var(--bg-selected)";

export const ComparisonTable = (props: ComparisonTableProps) => {
  const { columns, rows, summary, winnerIndex } = props;
  return (
    <div style={{ margin: "12px 0" }}>
      {/* Column count is model-authored and unbounded, so the table scrolls
          inside its own box rather than widening the page. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid var(--border-primary)", color: "var(--text-muted)", fontWeight: 500 }} />
              {columns.map((column, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    borderBottom: "2px solid var(--border-primary)",
                    color: "var(--text-heading)",
                    background: i === winnerIndex ? winnerBackground : undefined,
                  }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border-secondary)", color: "var(--text-secondary)", fontWeight: 500 }}>
                  {row.label}
                </th>
                {/* Values map to columns by index; a row shorter than the
                    header gets blank cells rather than a ragged table. */}
                {columns.map((_, i) => (
                  <td
                    key={i}
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--border-secondary)",
                      color: "var(--text-primary)",
                      fontWeight: row.winnerIndex != null && i === row.winnerIndex ? 600 : 400,
                      background: i === winnerIndex ? winnerBackground : undefined,
                    }}
                  >
                    {row.values[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary && (
        <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>{summary}</p>
      )}
    </div>
  );
};
