import { CHECKS, SEVERITIES, type CheckId, type Report, type Severity } from "@relaywright/catalog-rules";
import { CHECK_LABELS, SEVERITY_LABELS } from "./labels";

export interface FilterState {
  checks: Set<CheckId>;
  severities: Set<Severity>;
}

export const ALL_FILTERS: FilterState = { checks: new Set(CHECKS), severities: new Set(SEVERITIES) };

interface Props {
  report: Report;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

function toggle<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

export function Filters({ report, value, onChange }: Props) {
  const isAll = value.checks.size === CHECKS.length && value.severities.size === SEVERITIES.length;
  return (
    <div className="filters">
      <fieldset>
        <legend className="mono">Check</legend>
        {CHECKS.map((c) => (
          <label key={c} className="chip">
            <input
              type="checkbox"
              checked={value.checks.has(c)}
              onChange={() => onChange({ ...value, checks: toggle(value.checks, c) })}
            />
            <span>
              {CHECK_LABELS[c]} <span className="mono chip-n">{report.byCheck[c]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="mono">Severity</legend>
        {SEVERITIES.map((s) => (
          <label key={s} className={`chip chip-${s}`}>
            <input
              type="checkbox"
              checked={value.severities.has(s)}
              onChange={() => onChange({ ...value, severities: toggle(value.severities, s) })}
            />
            <span>
              {SEVERITY_LABELS[s].one[0]!.toUpperCase() + SEVERITY_LABELS[s].one.slice(1)}{" "}
              <span className="mono chip-n">{report.counts[s]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {!isAll && (
        <button type="button" className="link" onClick={() => onChange(ALL_FILTERS)}>
          Show everything
        </button>
      )}
    </div>
  );
}
