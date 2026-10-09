import { SEVERITIES, type Report, type Severity } from "@relaywright/catalog-rules";
import { SEVERITY_HELP, SEVERITY_LABELS, SEVERITY_RANK, formatMs, plural } from "./labels";

interface Props {
  report: Report;
  fileName: string;
  checkMs: number;
  onExport: () => void;
  exportCount: number;
  onReset: () => void;
}

export function Summary({ report, fileName, checkMs, onExport, exportCount, onReset }: Props) {
  const families = report.families.filter((f) => f.kind === "family").length;
  return (
    <section className="summary" aria-labelledby="summary-title">
      <div className="summary-head">
        <p className="dateline mono">{fileName}</p>
        <h1 id="summary-title" tabIndex={-1}>
          {report.issues.length === 0 ? (
            <>No problems found.</>
          ) : (
            <>
              {plural(report.issues.length, "problem", "problems")} across{" "}
              {plural(report.rowCount, "row", "rows")}. <em>Here's where they are.</em>
            </>
          )}
        </h1>
      </div>

      <div className="spec">
        <div className="spec-score" aria-label={`Catalog health ${report.score} out of 100`}>
          <span className="spec-key mono">Catalog health</span>
          <span className="score-figure">
            {report.score}
            <small>/100</small>
          </span>
        </div>
        <dl className="spec-fields">
          <div>
            <dt className="mono">Rows checked</dt>
            <dd>{report.rowCount.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="mono">Variation families</dt>
            <dd>{families.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="mono">Checked in</dt>
            <dd data-testid="check-time">{formatMs(checkMs)}</dd>
          </div>
        </dl>
        <ul className="sev-list">
          {SEVERITIES.map((s) => (
            <li key={s} className={`sev-row sev-${s}`} data-testid={`count-${s}`}>
              <span className="sev-count">{report.counts[s].toLocaleString("en-US")}</span>
              <span className="sev-name">
                {report.counts[s] === 1 ? SEVERITY_LABELS[s].one : SEVERITY_LABELS[s].many}
                <span className="sev-rows mono"> · {plural(report.rowsAffected[s], "row", "rows")}</span>
              </span>
              <span className="sev-help">{SEVERITY_HELP[s]}</span>
            </li>
          ))}
        </ul>
      </div>

      <CatalogStrip report={report} />

      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={onExport} disabled={exportCount === 0}>
          Export fix list <span className="mono btn-sub">{plural(exportCount, "issue", "issues")} · CSV</span>
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Check another file
        </button>
      </div>
    </section>
  );
}

const MAX_BINS = 240;

function CatalogStrip({ report }: { report: Report }) {
  if (report.rowCount === 0) return null;
  const worst = new Map<number, Severity>();
  for (const issue of report.issues) {
    const prev = worst.get(issue.rowNumber);
    if (!prev || SEVERITY_RANK[issue.severity] < SEVERITY_RANK[prev])
      worst.set(issue.rowNumber, issue.severity);
  }
  const rowNumbers = report.families
    .flatMap((f) => (f.parent ? [f.parent, ...f.children] : f.children))
    .map((r) => r.rowNumber)
    .sort((a, b) => a - b);
  const bins = Math.min(MAX_BINS, rowNumbers.length);
  const perBin = rowNumbers.length / bins;
  const cells: (Severity | "clean")[] = [];
  for (let b = 0; b < bins; b++) {
    let cell: Severity | "clean" = "clean";
    for (let i = Math.floor(b * perBin); i < Math.floor((b + 1) * perBin); i++) {
      const s = worst.get(rowNumbers[i]!);
      if (s && (cell === "clean" || SEVERITY_RANK[s] < SEVERITY_RANK[cell])) cell = s;
    }
    cells.push(cell);
  }
  const label =
    `Every row of the file in order, marked by its most serious problem: ` +
    `${report.rowsAffected.blocking} rows with blocking problems, ${report.rowsAffected.warning} with warnings, ` +
    `${report.rowsAffected.tidy} with tidy-ups, and ${report.rowCount - report.rowsAffected.blocking - report.rowsAffected.warning - report.rowsAffected.tidy} clean.`;

  return (
    <figure className="strip">
      <svg viewBox={`0 0 ${bins} 1`} preserveAspectRatio="none" role="img" aria-label={label}>
        {cells.map((c, i) => (
          <rect
            key={i}
            x={i + 0.12}
            y={c === "clean" ? 0.55 : 0}
            width={0.76}
            height={c === "clean" ? 0.45 : 1}
            className={`tick tick-${c}`}
          />
        ))}
      </svg>
      <figcaption className="mono">
        <span>
          Row {rowNumbers[0]}
          {perBin >= 1.5 ? ` · each tick is about ${Math.round(perBin).toLocaleString("en-US")} rows` : ""}
        </span>
        <span className="strip-key" aria-hidden="true">
          <i className="key key-blocking" /> blocking <i className="key key-warning" /> warning{" "}
          <i className="key key-tidy" /> tidy-up <i className="key key-clean" /> clean
        </span>
        <span>Row {rowNumbers[rowNumbers.length - 1]}</span>
      </figcaption>
    </figure>
  );
}
