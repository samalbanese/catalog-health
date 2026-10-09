import { useEffect, useRef, useState } from "react";
import { FIELDS, type FieldKey } from "@relaywright/catalog-rules";
import type { Mapping } from "../parse/headers";
import type { Loaded } from "./types";
import { FIELD_LABELS } from "./labels";

interface Props {
  loaded: Loaded;
  fileName: string;
  onRun: (mapping: Mapping) => void;
  onCancel: () => void;
}

const KEY_FIELDS: FieldKey[] = ["item_sku", "parent_sku", "parent_child", "variation_theme", "item_name"];

export function MappingStep({ loaded, fileName, onRun, onCancel }: Props) {
  const [mapping, setMapping] = useState<Mapping>(loaded.detection.mapping);
  const ambiguous = new Set(loaded.detection.ambiguous);
  const heading = useRef<HTMLHeadingElement>(null);
  // This screen replaces the control that opened the file, so focus moves to its heading.
  useEffect(() => heading.current?.focus(), []);
  const ordered = [...KEY_FIELDS, ...FIELDS.filter((f) => !KEY_FIELDS.includes(f))];

  function sampleValue(col: number | null): string {
    if (col === null) return "";
    const found = loaded.preview.find((r) => (r[col] ?? "").trim() !== "");
    return found ? found[col]! : "";
  }

  return (
    <section className="mapping" aria-labelledby="mapping-title">
      <p className="dateline mono">{fileName}</p>
      <h1 id="mapping-title" ref={heading} tabIndex={-1}>
        Match your columns
      </h1>
      <p className="lede">
        Some column names weren't clear enough to match on their own. Check each match below, then run the
        check. Only the SKU column is required. A field left unmatched counts as blank, so where the rules
        need it, each row is reported as missing it.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRun(mapping);
        }}
      >
        <div className="map-grid" role="group" aria-label="Column matches">
          {ordered.map((field) => {
            const col = mapping[field];
            const id = `map-${field}`;
            return (
              <div className="map-row" key={field}>
                <label htmlFor={id}>
                  {FIELD_LABELS[field]}
                  {field === "item_sku" && <span className="req"> (required)</span>}
                  {ambiguous.has(field) && (
                    <span className="flag-text"> · two columns matched, check this one</span>
                  )}
                </label>
                <select
                  id={id}
                  value={col === null ? "" : String(col)}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                >
                  <option value="">Not in this file</option>
                  {loaded.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                <span className="map-sample mono" aria-label={`Example value for ${FIELD_LABELS[field]}`}>
                  {sampleValue(col) || " "}
                </span>
              </div>
            );
          })}
        </div>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={mapping.item_sku === null}>
            Run the check
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Choose another file
          </button>
        </div>
      </form>
    </section>
  );
}
