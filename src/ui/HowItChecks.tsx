import { useEffect, useState } from "react";
import {
  CHECKS,
  CHECK_DESCRIPTIONS,
  SCORE_WEIGHTS,
  exampleRules,
  validateRuleSet,
  type IssueCode,
  type RuleSet,
} from "@relaywright/catalog-rules";
import { CHECK_LABELS, SEVERITY_LABELS } from "./labels";

interface Props {
  rules: RuleSet;
  onApply: (rules: RuleSet) => void;
}

const pct = (w: number) => `${Math.round(w * 100)}%`;

export function HowItChecks({ rules, onApply }: Props) {
  const [text, setText] = useState(() => JSON.stringify(rules, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const isExample = JSON.stringify(rules) === JSON.stringify(exampleRules);

  useEffect(() => setText(JSON.stringify(rules, null, 2)), [rules]);

  function apply() {
    setSaved(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setErrors([`The rules aren't valid JSON: ${(e as Error).message}`]);
      return;
    }
    const result = validateRuleSet(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaved(true);
    onApply(result.rules);
  }

  const codes = Object.entries(CHECK_DESCRIPTIONS) as [IssueCode, (typeof CHECK_DESCRIPTIONS)[IssueCode]][];

  return (
    <section className="how" id="how-it-checks" aria-labelledby="how-title">
      <h2 id="how-title">
        How it checks. <em>No AI, just rules you can read.</em>
      </h2>
      <p className="lede">
        Every check is a plain rule that runs on your computer, so the same file always gets the same result.
      </p>

      <div className="how-grid">
        {CHECKS.map((check) => (
          <div key={check} className="how-check">
            <h3>{CHECK_LABELS[check]}</h3>
            <ul>
              {codes
                .filter(([, d]) => d.check === check)
                .map(([code, d]) => (
                  <li key={code}>
                    <span className={`sev-tag sev-${d.severity}`}>{SEVERITY_LABELS[d.severity].one}</span>{" "}
                    {d.summary}
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <div className="how-check">
          <h3>The score</h3>
          <p>
            Out of 100, the share of rows that are clean. A row counts fully against the score when it has a
            blocking problem, {pct(SCORE_WEIGHTS.warning)} when its worst problem is a warning, and{" "}
            {pct(SCORE_WEIGHTS.tidy)} when its worst is a tidy-up. Each row counts once, however many problems
            it has.
          </p>
        </div>
      </div>

      <details className="rules-editor">
        <summary>
          Edit the rules <span className="mono">{isExample ? "example rules" : "your rules"}</span>
        </summary>
        <p className="rules-label">{rules.label}</p>
        <p>
          Required attributes by product type, banned phrases, and length limits all live here. Changes apply
          to this tab only.
        </p>
        <label htmlFor="rules-json" className="visually-hidden">
          Rules as JSON
        </label>
        <textarea
          id="rules-json"
          className="mono"
          spellCheck={false}
          value={text}
          rows={18}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length ? "rules-errors" : undefined}
        />
        {errors.length > 0 && (
          <ul id="rules-errors" className="rules-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={apply}>
            Apply rules
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setErrors([]);
              setSaved(false);
              onApply(exampleRules);
            }}
          >
            Reset to example rules
          </button>
          <span className="mono saved" role="status">
            {saved ? "Applied" : ""}
          </span>
        </div>
      </details>
    </section>
  );
}
