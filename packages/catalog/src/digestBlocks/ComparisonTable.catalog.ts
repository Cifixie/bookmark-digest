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
  "Comparison table for multi-source digests. Renders a table with N columns (one per source) and R rows (one per comparison criterion). Each row has a label and values — the model should fill in real comparative data extracted from each source. Use when synthesizing findings across 2+ sources on the same topic (product reviews, analyses, reports). Always attribute specific claims to the correct source column. Optional winnerIndex highlights the column with the best overall finding.";
