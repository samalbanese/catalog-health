import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectHeaderRow, scoreHeaderRow } from "./headers.ts";

/** An error whose message is already a plain sentence safe to show the user as is. */
export class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileError";
  }
}

const UNSUPPORTED = "This file type isn't supported. Use CSV, TSV, or XLSX.";
const UNREADABLE_SHEET = "This spreadsheet couldn't be read. Save it again as XLSX or CSV and try again.";
const SHEET_SCAN_ROWS = 10;
// About 130,000 rows of 300 columns. Past this, the browser tab could run out of memory.
const MAX_SHEET_CELLS = 40_000_000;
const SHEET_TOO_LARGE =
  "This sheet is too large to check in the browser. Delete unused columns or rows, or save just the product tab as CSV, and try again.";

export interface TableResult {
  table: string[][];
  /** The worksheet that was read; only set for spreadsheet files. */
  sheetName?: string;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}

function dropTrailingBlankRows(table: string[][]): string[][] {
  let end = table.length;
  while (end > 0 && isBlankRow(table[end - 1])) end -= 1;
  return end === table.length ? table : table.slice(0, end);
}

// Windows-1252 bytes 0x80 to 0x9F, which is where curly quotes, dashes, and the euro sign live.
// Everything else matches Latin-1. Written out because some runtimes (Node's TextDecoder among
// them) hand back control characters for this range instead of these characters.
const WINDOWS_1252_C1 = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function decodeWindows1252(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const parts: string[] = [];
  const CHUNK = 8192;
  for (let start = 0; start < view.length; start += CHUNK) {
    let chunk = "";
    const end = Math.min(start + CHUNK, view.length);
    for (let i = start; i < end; i += 1) {
      const b = view[i];
      chunk += String.fromCharCode(b >= 0x80 && b <= 0x9f ? WINDOWS_1252_C1[b - 0x80] : b);
    }
    parts.push(chunk);
  }
  return parts.join("");
}

/**
 * Decodes text as UTF-8 when it is valid UTF-8, otherwise as Windows-1252
 * (what Excel writes for "CSV" on Windows). Valid UTF-8 and Windows-1252 only
 * agree on plain ASCII, so a file with curly quotes or accents is never
 * misread as the wrong one. UTF-16 exports ("Unicode Text") are recognized by their BOM.
 */
function decodeText(bytes: ArrayBuffer): string {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  let text: string;
  if (head.length === 2 && head[0] === 0xff && head[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else if (head.length === 2 && head[0] === 0xfe && head[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(bytes);
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = decodeWindows1252(bytes);
    }
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseDelimited(text: string, delimiter: string | undefined): string[][] {
  // PapaParse's delimiter guess counts a final empty line as a one-column row,
  // which makes small two-column files undetectable. Trailing blank rows are dropped anyway.
  let end = text.length;
  while (end > 0 && (text.charCodeAt(end - 1) === 10 || text.charCodeAt(end - 1) === 13)) end -= 1;
  const result = Papa.parse<string[]>(end === text.length ? text : text.slice(0, end), {
    delimiter: delimiter ?? "",
    delimitersToGuess: [",", "\t", ";", "|"],
    skipEmptyLines: false,
  });
  // An unclosed quote makes the parser read every row after it as one long cell, which would
  // silently drop those products. Stop and say where instead.
  const unclosed = result.errors.find((e) => e.code === "MissingQuotes");
  if (unclosed !== undefined) {
    const where = typeof unclosed.row === "number" ? `row ${unclosed.row + 1}` : "one row";
    throw new FileError(
      `A quote mark in ${where} of this file is never closed, so the rows after it can't be read. Fix that cell, or save the file again from your spreadsheet app, and try again.`,
    );
  }
  return result.data.map((row) => row.map((c) => (c === undefined || c === null ? "" : String(c))));
}

function sheetRange(ws: XLSX.WorkSheet, maxRows?: number): XLSX.Range | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const full = XLSX.utils.decode_range(ref);
  // Always start at A1 so table indexes match the row numbers a person sees in Excel.
  const lastRow = maxRows === undefined ? full.e.r : Math.min(full.e.r, maxRows - 1);
  return { s: { r: 0, c: 0 }, e: { r: lastRow, c: full.e.c } };
}

function sheetRows(ws: XLSX.WorkSheet, maxRows?: number): string[][] {
  const range = sheetRange(ws, maxRows);
  if (!range) return [];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    range,
  });
  return data.map((row) => row.map((c) => (c === undefined || c === null ? "" : String(c))));
}

/**
 * Excel's General format shows long whole numbers like a 12-digit UPC as 4.00123E+11,
 * which would corrupt barcodes. Write those out as plain digits instead.
 */
function spellOutLongIntegers(ws: XLSX.WorkSheet): void {
  for (const address of Object.keys(ws)) {
    if (address.charCodeAt(0) === 33) continue; // "!ref", "!merges" and similar
    const cell = ws[address] as XLSX.CellObject | undefined;
    if (!cell || cell.t !== "n" || typeof cell.v !== "number") continue;
    if (!Number.isInteger(cell.v) || Math.abs(cell.v) < 1e10 || Math.abs(cell.v) >= 1e16) continue;
    if (cell.z === undefined || cell.z === "General") cell.w = String(cell.v);
  }
}

function pickSheet(wb: XLSX.WorkBook): string | undefined {
  let best: string | undefined;
  let bestHits = 0;
  let bestCanonical = 0;
  let firstWithData: string | undefined;
  for (const name of wb.SheetNames) {
    const head = sheetRows(wb.Sheets[name], SHEET_SCAN_ROWS);
    if (firstWithData === undefined && head.some((r) => !isBlankRow(r))) firstWithData = name;
    const score = scoreHeaderRow(head[detectHeaderRow(head)] ?? []);
    if (
      score.hits > bestHits ||
      (score.hits === bestHits && score.hits > 0 && score.canonical > bestCanonical)
    ) {
      best = name;
      bestHits = score.hits;
      bestCanonical = score.canonical;
    }
  }
  return best ?? firstWithData ?? wb.SheetNames[0];
}

/**
 * Sets a sheet's range from the cells it really has. A file can declare a range far larger than
 * its data (A1:XFD1048576 is 17 billion cells), and reading that range would fill every gap.
 */
function trimToCells(ws: XLSX.WorkSheet): number {
  let lastRow = -1;
  let lastCol = -1;
  for (const address of Object.keys(ws)) {
    if (address.charCodeAt(0) === 33) continue; // "!ref", "!merges" and similar
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r > lastRow) lastRow = r;
    if (c > lastCol) lastCol = c;
  }
  if (lastRow < 0) {
    delete ws["!ref"];
    return 0;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });
  return (lastRow + 1) * (lastCol + 1);
}

function readSpreadsheet(bytes: ArrayBuffer): TableResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellNF: true });
  } catch {
    throw new FileError(UNREADABLE_SHEET);
  }
  const cells = new Map(wb.SheetNames.map((name) => [name, trimToCells(wb.Sheets[name])]));
  const sheetName = pickSheet(wb);
  if (sheetName === undefined) return { table: [] };
  if ((cells.get(sheetName) ?? 0) > MAX_SHEET_CELLS) throw new FileError(SHEET_TOO_LARGE);
  const ws = wb.Sheets[sheetName];
  spellOutLongIntegers(ws);
  return { table: dropTrailingBlankRows(sheetRows(ws)), sheetName };
}

/**
 * Reads a CSV, TSV, or spreadsheet into rows of strings. The header row is not
 * located here: the table keeps any rows above it so row numbers stay true.
 */
export function readTable(name: string, bytes: ArrayBuffer): TableResult {
  const ext = extensionOf(name);
  if (ext === "csv" || ext === "txt")
    return { table: dropTrailingBlankRows(parseDelimited(decodeText(bytes), undefined)) };
  if (ext === "tsv") return { table: dropTrailingBlankRows(parseDelimited(decodeText(bytes), "\t")) };
  if (ext === "xlsx" || ext === "xlsm" || ext === "xls") return readSpreadsheet(bytes);
  throw new FileError(UNSUPPORTED);
}
