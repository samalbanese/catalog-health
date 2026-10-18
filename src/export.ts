import type { Issue } from "@samalbanese/catalog-rules";

const HEADER = ["sku", "row", "severity", "field", "problem", "suggested_fix"];

/**
 * A spreadsheet runs any cell that starts with one of these as a formula.
 * A leading apostrophe makes Excel and Sheets show the cell as plain text.
 */
function neutralize(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function encode(cell: string): string {
  return quote(neutralize(cell));
}

/**
 * The fix list as a CSV that opens cleanly in Excel: UTF-8 with a BOM so accents
 * survive, CRLF line endings, RFC 4180 quoting, and no cell that can run as a formula.
 */
export function fixListCsv(issues: Issue[]): string {
  const lines = [HEADER.join(",")];
  for (const issue of issues) {
    const sku = issue.sku === "" ? `(row ${issue.rowNumber})` : issue.sku;
    lines.push(
      [sku, String(issue.rowNumber), issue.severity, issue.field, issue.problem, issue.suggestedFix]
        .map(encode)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
