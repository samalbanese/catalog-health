import { useEffect, useMemo, useRef, useState } from "react";
import { exampleRules, type Issue, type RuleSet, type Severity } from "@relaywright/catalog-rules";
import { createChecker } from "./parse/client";
import type { Mapping } from "./parse/headers";
import { fixListCsv } from "./export";
import { downloadText, sampleFile } from "./sample";
import { Intro } from "./ui/Intro";
import { MappingStep } from "./ui/MappingStep";
import { Summary } from "./ui/Summary";
import { ALL_FILTERS, Filters, type FilterState } from "./ui/Filters";
import { FamilyList, type FamilyGroup } from "./ui/FamilyList";
import { HowItChecks } from "./ui/HowItChecks";
import { SEVERITY_RANK } from "./ui/labels";
import type { Checked, Loaded } from "./ui/types";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "mapping"; loaded: Loaded; fileName: string }
  | { kind: "results" }
  | { kind: "error"; message: string };

interface Result {
  fileName: string;
  mapping: Mapping;
  checked: Checked;
  /** Reading and parsing the file, measured in the worker. */
  parseMs: number;
}

export function App() {
  const checker = useRef<ReturnType<typeof createChecker> | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [rules, setRules] = useState<RuleSet>(exampleRules);
  const [result, setResult] = useState<Result | null>(null);
  const [filters, setFilters] = useState<FilterState>(ALL_FILTERS);
  const heading = useRef<HTMLDivElement>(null);
  // Each load, check, and reset takes a new number; a reply that arrives after a newer request
  // started is dropped, so starting over never brings back an old result.
  const request = useRef(0);
  // The rules a check should use, read when it starts rather than when the file was chosen.
  const rulesNow = useRef(rules);

  useEffect(() => () => checker.current?.dispose(), []);

  function getChecker() {
    checker.current ??= createChecker();
    return checker.current;
  }

  async function openFile(file: File) {
    const id = ++request.current;
    setResult(null);
    setPhase({ kind: "working", message: `Reading ${file.name}` });
    try {
      const loaded = await getChecker().load(file);
      if (id !== request.current) return;
      if (loaded.rowCount === 0) throw new Error("This file has no product rows under its header row.");
      if (loaded.detection.confident) await runCheck(file.name, loaded.detection.mapping, loaded.parseMs);
      else setPhase({ kind: "mapping", loaded, fileName: file.name });
    } catch (e) {
      if (id === request.current) setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  async function runCheck(fileName: string, mapping: Mapping, parseMs: number) {
    const id = ++request.current;
    setPhase({ kind: "working", message: `Checking ${fileName}` });
    try {
      const used = rulesNow.current;
      const checked = await getChecker().check(mapping, used);
      if (id !== request.current) return;
      // Rules applied while this check ran: check again so the report matches the editor.
      if (used !== rulesNow.current) return runCheck(fileName, mapping, parseMs);
      setResult({ fileName, mapping, checked, parseMs });
      setFilters(ALL_FILTERS);
      setPhase({ kind: "results" });
      requestAnimationFrame(() => heading.current?.querySelector("h1")?.focus());
    } catch (e) {
      if (id === request.current) setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  function applyRules(next: RuleSet) {
    rulesNow.current = next;
    setRules(next);
    // A file still loading has no result yet; its check reads the new rules when it starts.
    if (result) void runCheck(result.fileName, result.mapping, result.parseMs);
  }

  function reset() {
    request.current++;
    setResult(null);
    setPhase({ kind: "idle" });
    // The control that started over is gone; put focus on the start screen's heading.
    requestAnimationFrame(() => document.getElementById("intro-title")?.focus());
  }

  const filtered: Issue[] = useMemo(
    () =>
      result
        ? result.checked.report.issues.filter(
            (i) => filters.checks.has(i.check) && filters.severities.has(i.severity),
          )
        : [],
    [result, filters],
  );

  const groups: FamilyGroup[] = useMemo(() => {
    if (!result) return [];
    const byFamily = new Map<string, Issue[]>();
    for (const i of filtered) {
      const list = byFamily.get(i.family);
      if (list === undefined) byFamily.set(i.family, [i]);
      else list.push(i);
    }
    const out: FamilyGroup[] = [];
    result.checked.report.families.forEach((family) => {
      const issues = byFamily.get(family.key);
      if (!issues) return;
      const worst = issues.reduce<Severity>(
        (w, i) => (SEVERITY_RANK[i.severity] < SEVERITY_RANK[w] ? i.severity : w),
        "tidy",
      );
      out.push({ family, issues, worst });
    });
    return out.sort(
      (a, b) => SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst] || b.issues.length - a.issues.length,
    );
  }, [result, filtered]);

  const busy = phase.kind === "working";
  const showResults = phase.kind === "results" && result;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mast">
        <a className="mark" href="/" onClick={(e) => (e.preventDefault(), reset())}>
          Catalog Health Checker
        </a>
        <nav aria-label="Page">
          <a href="#how-it-checks">How it checks</a>
          <a href="https://github.com/relaywright/catalog-health">Source ↗</a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        {(phase.kind === "idle" || phase.kind === "working" || phase.kind === "error") && !showResults && (
          <Intro busy={busy} onFile={openFile} onSample={() => openFile(sampleFile())} />
        )}

        <div className="status" role="status" aria-live="polite">
          {busy && <p className="working mono">{phase.message}…</p>}
        </div>
        {phase.kind === "error" && (
          <div className="error" role="alert">
            <p>{phase.message}</p>
            <button type="button" className="link" onClick={reset}>
              Try another file
            </button>
          </div>
        )}

        {phase.kind === "mapping" && (
          <MappingStep
            loaded={phase.loaded}
            fileName={phase.fileName}
            onRun={(mapping) => runCheck(phase.fileName, mapping, phase.loaded.parseMs)}
            onCancel={reset}
          />
        )}

        {showResults && (
          <div ref={heading} className="results">
            <Summary
              report={result.checked.report}
              fileName={result.fileName}
              checkMs={result.parseMs + result.checked.checkMs}
              exportCount={filtered.length}
              onExport={() =>
                downloadText(
                  result.fileName.replace(/\.[^.]+$/, "") + "-fix-list.csv",
                  fixListCsv(filtered),
                  "text/csv",
                )
              }
              onReset={reset}
            />
            {result.checked.report.issues.length > 0 && (
              <section className="problems" aria-labelledby="problems-title">
                <h2 id="problems-title" className="sec-title">
                  Problems by family
                </h2>
                <Filters report={result.checked.report} value={filters} onChange={setFilters} />
                <FamilyList
                  key={`${result.fileName}:${result.checked.report.issues.length}`}
                  groups={groups}
                />
              </section>
            )}
          </div>
        )}

        <HowItChecks rules={rules} onApply={applyRules} />
      </main>

      <footer className="foot mono">
        <span>Your file is read in this tab and never uploaded.</span>
        <span>MIT license · relaywright</span>
      </footer>
    </>
  );
}
