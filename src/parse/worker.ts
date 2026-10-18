// Runs in a Web Worker so a 70,000-row file never freezes the page.
// The file stays in memory here; nothing is sent anywhere.
import { runChecks } from "@samalbanese/catalog-rules";
import { detectHeaderRow, detectMapping } from "./headers.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";
import { toRows } from "./rows.ts";
import { FileError, readTable } from "./table.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker): void;
}

const scope = self as unknown as WorkerScope;

const EMPTY_FILE = "This file looks empty. Choose a file with a header row and product rows.";
const NO_ROWS =
  "No product rows were found below the header row. Check that the file has data under its column names.";
const NOT_LOADED = "Choose a file before running the checks.";
const LOAD_FAILED = "This file couldn't be read. Save it again as CSV or XLSX and try again.";
const CHECK_FAILED =
  "Something went wrong while checking the file. Try again, or save the file as CSV and re-upload it.";

let table: string[][] | null = null;
let headerRow = 0;

function isBlank(row: string[]): boolean {
  return row.every((c) => String(c ?? "").trim() === "");
}

function load(name: string, bytes: ArrayBuffer): FromWorker {
  const started = performance.now();
  table = null;
  const result = readTable(name, bytes);
  if (result.table.length === 0) return { type: "error", message: EMPTY_FILE };

  headerRow = detectHeaderRow(result.table);
  const headers = (result.table[headerRow] ?? []).map((c) => String(c ?? ""));
  const preview: string[][] = [];
  let rowCount = 0;
  for (let i = headerRow + 1; i < result.table.length; i += 1) {
    if (isBlank(result.table[i])) continue;
    rowCount += 1;
    if (preview.length < 5) preview.push(result.table[i]);
  }
  if (rowCount === 0) return { type: "error", message: NO_ROWS };

  table = result.table;
  const detection = detectMapping(headers);
  return {
    type: "loaded",
    headers,
    headerRow,
    rowCount,
    preview,
    detection,
    sheetName: result.sheetName,
    parseMs: performance.now() - started,
  };
}

function check(message: Extract<ToWorker, { type: "check" }>): FromWorker {
  if (!table) return { type: "error", message: NOT_LOADED };
  const started = performance.now();
  const rows = toRows(table, headerRow, message.mapping);
  const report = runChecks(rows, message.rules);
  return { type: "report", report, rows, checkMs: performance.now() - started };
}

scope.onmessage = (event) => {
  const message = event.data;
  let reply: FromWorker;
  try {
    reply = message.type === "load" ? load(message.name, message.bytes) : check(message);
  } catch (err) {
    const fallback = message.type === "load" ? LOAD_FAILED : CHECK_FAILED;
    reply = { type: "error", message: err instanceof FileError ? err.message : fallback };
  }
  scope.postMessage(reply);
};
