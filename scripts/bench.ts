// Times the part of the app that scales with file size: parse a 70,000-row CSV, then check it.
//   npm run bench

import Papa from "papaparse";
import { FIELDS, exampleRules, runChecks } from "../packages/rules/src/index.ts";
import type { Row } from "../packages/rules/src/index.ts";
import { SAMPLE_OPTIONS, generateCatalog, toCsv } from "../samples/generate.ts";

const ROWS = 70_000;
const RUNS = 5;

const { rows: generated } = generateCatalog({
  seed: SAMPLE_OPTIONS.seed,
  families: 0,
  standalone: 0,
  plant: false,
  targetRows: ROWS,
});
const csv = toCsv(generated);
console.log(
  `File: ${generated.length.toLocaleString("en-US")} rows, ${(csv.length / 1024 / 1024).toFixed(1)} MB of CSV`,
);
console.log(`Node ${process.version} on ${process.platform}\n`);

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Same work the app's worker does: parse the text, then turn each line into a Row. */
function parse(text: string): Row[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const table = result.data;
  const header = table[0];
  const columns = FIELDS.map((f) => header.indexOf(f));
  const rows: Row[] = [];
  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    const fields: Record<string, string> = {};
    FIELDS.forEach((f, c) => {
      const at = columns[c];
      fields[f] = at >= 0 ? (line[at] ?? "").trim() : "";
    });
    rows.push({ rowNumber: i + 1, fields });
  }
  return rows;
}

const totals: number[] = [];
const parses: number[] = [];
const checks: number[] = [];
let issueCount = 0;

for (let run = 1; run <= RUNS; run++) {
  const t0 = performance.now();
  const rows = parse(csv);
  const t1 = performance.now();
  const report = runChecks(rows, exampleRules);
  const t2 = performance.now();
  issueCount = report.issues.length;
  parses.push(t1 - t0);
  checks.push(t2 - t1);
  totals.push(t2 - t0);
  console.log(
    `run ${run}: parse ${(t1 - t0).toFixed(0)} ms, check ${(t2 - t1).toFixed(0)} ms, total ${(t2 - t0).toFixed(0)} ms (${report.rowCount} rows, ${issueCount} issues, score ${report.score})`,
  );
}

console.log(
  `\nmedian over ${RUNS} runs: parse ${median(parses).toFixed(0)} ms, check ${median(checks).toFixed(0)} ms, total ${median(totals).toFixed(0)} ms`,
);
