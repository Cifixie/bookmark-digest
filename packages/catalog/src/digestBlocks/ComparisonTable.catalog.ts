import { z } from "zod";

export type ComparisonTableRow = z.infer<typeof comparisonTableRow>;

const comparisonTableRow = z.object({
  /** Row key (used as children array reference). */
  key: z.string(),
  /** Display label for the row (e.g. "Sound Quality"). */
  label: z.string(),
  /** One value per source/column — mapped to columns by index. */
  values: z.array(z.string()),
  /** Optional per-row winner highlight (index into values, 0-based). */
  winnerIndex: z.number().int().min(0).max(99).optional(),
});

export type ComparisonTableProps = z.infer<typeof props>;

export const props = z.object({
  /** Column headers (source names / product labels, e.g. ["Source 1", "Source 2", "Source 3"]). */
  columns: z.array(z.string()),
  /** Comparison rows — each row describes one criterion and values per source. */
  rows: z.array(comparisonTableRow),
  /** Overall verdict or summary across all sources. */
  summary: z.string().optional(),
  /** Winning item index (overall) if the sources converge on a clear favorite. */
  winnerIndex: z.number().int().min(0).max(99).optional(),
});

export const description =
  "Generic data table. Renders a table with N columns and R rows. Each row has a label and values — the model should fill in real data extracted from the content. Two uses: (1) multi-source digests — one column per source, rows are comparison criteria, always attribute specific claims to the correct source column, optional winnerIndex highlights the column with the best overall finding; (2) single-source data-heavy content (research papers, reports with metrics/results tables) — columns are whatever the data's own structure calls for (e.g. metric names, conditions, time periods), rows are the data points. winnerIndex/summary are comparison-specific and should be omitted when not applicable.";
