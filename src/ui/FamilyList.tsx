import { useState } from "react";
import { SEVERITIES, type Family, type Issue, type Row, type Severity } from "@samalbanese/catalog-rules";
import { CHECK_LABELS, SEVERITY_LABELS, SEVERITY_RANK, fieldLabel, plural } from "./labels";

export interface FamilyGroup {
  family: Family;
  issues: Issue[];
  worst: Severity;
}

const PAGE = 40;
/** Rows shown at once in an opened family, so a family of thousands of rows can't stall the page. */
const PANEL_PAGE = 100;

export function FamilyList({ groups }: { groups: FamilyGroup[] }) {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="empty">
        Nothing matches these filters. Turn a check or severity back on to see its problems.
      </p>
    );
  }

  return (
    <div className="families">
      <p className="families-count mono" aria-live="polite">
        {plural(groups.length, "family or row", "families and rows")} with problems, most serious first
      </p>
      <ol className="family-list">
        {groups.slice(0, shown).map((g) => (
          <FamilyItem
            key={g.family.key}
            group={g}
            open={open === g.family.key}
            onToggle={() => setOpen(open === g.family.key ? null : g.family.key)}
          />
        ))}
      </ol>
      {shown < groups.length && (
        <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, groups.length - shown)} more{" "}
          <span className="mono btn-sub">{groups.length - shown} left</span>
        </button>
      )}
    </div>
  );
}

function titleOf(f: Family): string {
  const row = f.parent ?? f.children[0];
  return row?.fields.item_name || "Untitled";
}

function kindLabel(f: Family): string {
  if (f.kind === "family") return `Family · ${plural(f.children.length, "child", "children")}`;
  if (f.kind === "orphans")
    return `Orphans · ${plural(f.children.length, "child", "children")}, parent not found`;
  return "Standalone";
}

function FamilyItem({ group, open, onToggle }: { group: FamilyGroup; open: boolean; onToggle: () => void }) {
  const { family, issues } = group;
  const panelId = `fam-${family.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const counts = SEVERITIES.map((s) => [s, issues.filter((i) => i.severity === s).length] as const).filter(
    ([, n]) => n > 0,
  );
  return (
    <li className={`family worst-${group.worst}${open ? " is-open" : ""}`}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <span className="fam-key mono">
            {family.key.startsWith("row:") ? `Row ${family.key.slice(4)}` : family.key}
          </span>
          <span className="fam-title">{titleOf(family)}</span>
          <span className="fam-meta mono">
            {kindLabel(family)}
            {counts.map(([s, n]) => (
              <span key={s} className={`sev-tag sev-${s}`}>
                {plural(n, SEVERITY_LABELS[s].one, SEVERITY_LABELS[s].many)}
              </span>
            ))}
          </span>
          <span className="fam-arrow" aria-hidden="true">
            {open ? "−" : "+"}
          </span>
        </button>
      </h3>
      {open && <FamilyPanel id={panelId} family={family} issues={issues} />}
    </li>
  );
}

const COLUMNS: { key: string; label: string }[] = [
  { key: "parent_child", label: "Role" },
  { key: "item_sku", label: "SKU" },
  { key: "size_name", label: "Size" },
  { key: "color_name", label: "Color" },
  { key: "variation_theme", label: "Theme" },
  { key: "external_product_id", label: "UPC or EAN" },
  { key: "standard_price", label: "Price" },
];

function role(row: Row, family: Family): string {
  if (family.parent === row) return "Parent";
  if (family.kind === "standalone") return "Standalone";
  return "Child";
}

function FamilyPanel({ id, family, issues }: { id: string; family: Family; issues: Issue[] }) {
  const [limit, setLimit] = useState(PANEL_PAGE);
  const allRows = family.parent ? [family.parent, ...family.children] : family.children;
  const rows = allRows.slice(0, limit);
  const byRow = new Map<number, Issue[]>();
  for (const i of issues) {
    const list = byRow.get(i.rowNumber);
    if (list === undefined) byRow.set(i.rowNumber, [i]);
    else list.push(i);
  }
  const flagged = new Set(issues.map((i) => `${i.rowNumber}:${i.field}`));
  const rowsWithIssues = rows.filter((r) => byRow.has(r.rowNumber));

  return (
    <div className="fam-panel" id={id}>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={`Rows in ${family.key}`}>
        <table>
          <thead>
            <tr>
              <th scope="col" className="mono">
                Row
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="mono">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="mono">
                Problems
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowNumber} className={byRow.has(r.rowNumber) ? "has-issues" : undefined}>
                <td className="mono">{r.rowNumber}</td>
                {COLUMNS.map((c) => {
                  const bad = flagged.has(`${r.rowNumber}:${c.key}`);
                  const value = c.key === "parent_child" ? role(r, family) : (r.fields[c.key] ?? "");
                  return (
                    <td key={c.key} className={bad ? "cell-flag" : undefined}>
                      {value || <span className="blank">blank</span>}
                      {bad && <span className="visually-hidden"> (problem)</span>}
                    </td>
                  );
                })}
                <td className="mono">{byRow.get(r.rowNumber)?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="issue-list">
        {rowsWithIssues.flatMap((r) =>
          [...byRow.get(r.rowNumber)!]
            .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
            .map((i) => (
              <li key={i.id} className={`issue sev-${i.severity}`}>
                <p className="issue-meta mono">
                  <span className={`sev-tag sev-${i.severity}`}>{SEVERITY_LABELS[i.severity].one}</span> Row{" "}
                  {i.rowNumber} · {i.sku || "no SKU"} · {CHECK_LABELS[i.check]}
                  {i.field ? ` · ${fieldLabel(i.field)}` : ""}
                </p>
                <p className="issue-problem">{i.problem}</p>
                <p className="issue-fix">
                  <span className="mono">Fix</span> {i.suggestedFix}
                </p>
              </li>
            )),
        )}
      </ul>

      {limit < allRows.length && (
        <p className="fam-more">
          <span className="mono">
            Showing rows 1 to {limit.toLocaleString("en-US")} of {allRows.length.toLocaleString("en-US")}. The
            fix list includes every problem that matches your filters, in rows shown here or not.
          </span>{" "}
          <button type="button" className="btn" onClick={() => setLimit(limit + PANEL_PAGE)}>
            Show {Math.min(PANEL_PAGE, allRows.length - limit)} more rows
          </button>
        </p>
      )}
    </div>
  );
}
