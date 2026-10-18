import { FIELDS, type Row } from "@samalbanese/catalog-rules";
import { normalizeHeader, type Mapping } from "./headers.ts";

const CANONICAL = new Set<string>(FIELDS);

function cell(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

/**
 * Turns the cells below the header row into rules-ready rows.
 * Mapped columns land under their canonical keys. Every other non-empty header
 * lands under its normalized name, except a column named like a canonical field
 * that the mapping left out (the user chose to ignore it, so it must not sneak
 * back in). Blank rows are skipped but later row numbers stay true to the sheet.
 */
export function toRows(table: string[][], headerRow: number, mapping: Mapping): Row[] {
  const headers = table[headerRow] ?? [];

  const columns: { key: string; index: number }[] = [];
  const taken = new Set<string>();
  const mappedIndexes = new Set<number>();
  for (const field of FIELDS) {
    const index = mapping[field];
    if (index === null || index === undefined) continue;
    columns.push({ key: field, index });
    taken.add(field);
    mappedIndexes.add(index);
  }
  headers.forEach((header, index) => {
    if (mappedIndexes.has(index)) return;
    const key = normalizeHeader(cell(header));
    if (!key || CANONICAL.has(key) || taken.has(key)) return;
    taken.add(key);
    columns.push({ key, index });
  });

  const rows: Row[] = [];
  for (let i = headerRow + 1; i < table.length; i += 1) {
    const line = table[i];
    if (!line || line.every((c) => cell(c) === "")) continue;
    const fields: Record<string, string> = {};
    for (const field of FIELDS) fields[field] = "";
    for (const { key, index } of columns) fields[key] = cell(line[index]);
    rows.push({ rowNumber: i + 1, fields });
  }
  return rows;
}
