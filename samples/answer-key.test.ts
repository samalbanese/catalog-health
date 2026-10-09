import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { FIELDS, exampleRules, runChecks } from "../packages/rules/src/index.ts";
import type { IssueCode, Row } from "../packages/rules/src/index.ts";
import { SAMPLE_OPTIONS, generateCatalog, toCsv, upcCheckDigit } from "./generate.ts";

const csvText = readFileSync(new URL("./westbrook-catalog.csv", import.meta.url), "utf8");
const answerKey = JSON.parse(readFileSync(new URL("./answer-key.json", import.meta.url), "utf8")) as {
  code: IssueCode;
  sku: string;
  field: string;
}[];

const parsed = Papa.parse<Record<string, string>>(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
  transform: (v) => v.trim(),
});
const rows: Row[] = parsed.data.map((fields, i) => ({ rowNumber: i + 2, fields }));
const report = runChecks(rows, exampleRules);

const PLANTED: Record<IssueCode, number> = {
  "orphan-child": 3,
  "childless-parent": 2,
  "theme-mismatch": 3,
  "duplicate-variant": 3,
  "missing-theme-attribute": 4,
  "missing-required": 6,
  "unknown-product-type": 2,
  "duplicate-sku": 2,
  "duplicate-external-id": 4,
  "duplicate-style": 4,
  "near-duplicate-title": 4,
  "title-too-long": 3,
  "banned-phrase": 4,
  "all-caps-word": 3,
  "title-brand-prefix": 3,
  "bullet-count": 3,
  "bullet-too-long": 2,
  "missing-sku": 1,
  "missing-image": 4,
  "missing-price": 3,
  "sale-above-list": 3,
};

function countByCode(codes: IssueCode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = (out[c] ?? 0) + 1;
  return out;
}

describe("sample catalog", () => {
  it("has the expected shape", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual([...FIELDS]);
    expect(rows.length).toBeGreaterThanOrEqual(280);
    expect(rows.length).toBeLessThanOrEqual(320);
  });

  it("is exactly what the generator writes for the committed seed", () => {
    const fresh = generateCatalog(SAMPLE_OPTIONS);
    expect(csvText).toBe(toCsv(fresh.rows));
    expect(answerKey).toEqual(fresh.answerKey);
  });

  it("is fictional: invented brand, 04 barcodes with valid check digits, example.com images", () => {
    for (const { fields, rowNumber } of rows) {
      if (fields.brand_name !== "") expect(fields.brand_name, `row ${rowNumber}`).toBe("Westbrook & Co.");
      const upc = fields.external_product_id;
      if (upc !== "") {
        expect(upc, `row ${rowNumber}`).toMatch(/^04\d{10}$/);
        expect(Number(upc[11]), `row ${rowNumber}`).toBe(upcCheckDigit(upc.slice(0, 11)));
      }
      if (fields.main_image_url !== "") {
        expect(fields.main_image_url, `row ${rowNumber}`).toMatch(/^https:\/\/example\.com\//);
      }
    }
  });

  it("contains no em dash", () => {
    expect(csvText).not.toContain("—");
    expect(JSON.stringify(answerKey)).not.toContain("—");
  });
});

describe("answer key", () => {
  it("plants the exact count for every issue code", () => {
    expect(countByCode(answerKey.map((a) => a.code))).toEqual(PLANTED);
  });

  it("matches what the engine finds, exactly", () => {
    const planted = new Set(answerKey.map((a) => `${a.code}|${a.sku}|${a.field}`));
    const found = new Set(report.issues.map((i) => `${i.code}|${i.sku}|${i.field}`));
    const missing = [...planted].filter((k) => !found.has(k));
    const extra = [...found].filter((k) => !planted.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(planted.size).toBe(answerKey.length);
    expect(report.issues.length).toBe(answerKey.length);
  });

  it("gives the engine's own per-code counts too", () => {
    expect(countByCode(report.issues.map((i) => i.code))).toEqual(PLANTED);
  });
});
