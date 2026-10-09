import { describe, expect, it } from "vitest";
import {
  CHECK_DESCRIPTIONS,
  SCORE_WEIGHTS,
  exampleRules,
  runChecks,
  score,
  validateRuleSet,
} from "../src/index.ts";
import type { IssueCode, Row } from "../src/types.ts";
import { child, clean, parent, row } from "./fixtures.ts";

describe("score", () => {
  it("matches the documented example", () => {
    expect(SCORE_WEIGHTS).toEqual({ blocking: 1, warning: 0.4, tidy: 0.1 });
    expect(score({ blocking: 1, warning: 2, tidy: 0 }, 10)).toBe(82);
  });
  it("is 100 for an empty file and never leaves 0 to 100", () => {
    expect(score({ blocking: 0, warning: 0, tidy: 0 }, 0)).toBe(100);
    expect(score({ blocking: 5, warning: 0, tidy: 0 }, 5)).toBe(0);
    expect(score({ blocking: 9, warning: 0, tidy: 0 }, 5)).toBe(0);
  });
});

describe("runChecks", () => {
  it("gives a perfect report for an empty input", () => {
    const r = runChecks([], exampleRules);
    expect(r.rowCount).toBe(0);
    expect(r.issues).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.counts).toEqual({ blocking: 0, warning: 0, tidy: 0 });
    expect(r.byCheck).toEqual({ variations: 0, required: 0, duplicates: 0, content: 0, basics: 0 });
    expect(r.rowsAffected).toEqual({ blocking: 0, warning: 0, tidy: 0 });
    expect(r.families).toEqual([]);
  });

  it("gives 100 for a clean catalog", () => {
    const rows = [parent(2, "P1"), child(3, "P1-A", "P1"), child(4, "P1-B", "P1"), clean(5, "S1")];
    const r = runChecks(rows, exampleRules);
    expect(r.issues).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.families.map((f) => f.key)).toEqual(["P1", "S1"]);
  });

  it("drops missing-required when missing-theme-attribute covers the same row and field", () => {
    const rows = [parent(2, "P1"), child(3, "C1", "P1", { size_name: "", material_type: "" })];
    const r = runChecks(rows, exampleRules);
    const ids = r.issues.map((i) => i.id);
    expect(ids).toContain("missing-theme-attribute:3:size_name");
    expect(ids).not.toContain("missing-required:3:size_name");
    expect(ids).toContain("missing-required:3:material_type");
  });

  it("keeps missing-required on a field the theme does not cover", () => {
    const rows = [parent(2, "P1", { variation_theme: "Size" }), child(3, "C1", "P1", { color_name: "" })];
    const ids = runChecks(rows, exampleRules).issues.map((i) => i.id);
    expect(ids).toEqual(["missing-required:3:color_name"]);
  });

  it("sorts by row, then severity, then code", () => {
    const rows = [
      clean(2, "S1", {
        standard_price: "",
        item_name: "Marlow Dress",
        bullet_point5: "",
        bullet_point4: "",
        bullet_point3: "",
      }),
      clean(3, "S2", { main_image_url: "" }),
    ];
    const r = runChecks(rows, exampleRules);
    expect(r.issues.map((i) => `${i.rowNumber}:${i.severity}:${i.code}`)).toEqual([
      "2:blocking:missing-price",
      "2:tidy:bullet-count",
      "2:tidy:title-brand-prefix",
      "3:blocking:missing-image",
    ]);
  });

  it("counts issues by severity and check, and each row once under its worst severity", () => {
    const rows: Row[] = [
      clean(2, "S1", { standard_price: "" }), // blocking only
      clean(3, "S2", { sale_price: "99.00", item_name: "Marlow Dress" }), // warning + tidy
      clean(4, "S3", { item_name: "Westbrook & Co. S3 BREATHABLE Dress" }), // tidy only
      clean(5, "S4"),
      clean(6, "S5", { standard_price: "", main_image_url: "", sale_price: "" }), // two blocking
    ];
    const r = runChecks(rows, exampleRules);
    expect(r.rowCount).toBe(5);
    expect(r.counts).toEqual({ blocking: 3, warning: 1, tidy: 2 });
    expect(r.byCheck).toEqual({ variations: 0, required: 0, duplicates: 0, content: 2, basics: 4 });
    expect(r.rowsAffected).toEqual({ blocking: 2, warning: 1, tidy: 1 });
    expect(r.score).toBe(Math.round(100 * (1 - (2 + 0.4 + 0.1) / 5)));
  });

  it("scores the 10 row example as 82", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 10; i++) rows.push(clean(i + 2, `S${i}`));
    rows[0] = clean(2, "S0", { standard_price: "" });
    rows[1] = clean(3, "S1", { sale_price: "99.00" });
    rows[2] = clean(4, "S2", { sale_price: "99.00" });
    const r = runChecks(rows, exampleRules);
    expect(r.rowsAffected).toEqual({ blocking: 1, warning: 2, tidy: 0 });
    expect(r.score).toBe(82);
  });

  it("never drops or crashes on blank and repeated SKUs", () => {
    const rows = [
      row(2, { item_name: "No SKU at all" }),
      clean(3, "S1"),
      clean(4, "S1"),
      parent(5, "P1"),
      parent(6, "P1"),
      child(7, "C1", "P1"),
    ];
    const r = runChecks(rows, exampleRules);
    expect(r.rowCount).toBe(6);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("missing-sku");
    expect(codes).toContain("duplicate-sku");
    expect(new Set(r.issues.map((i) => i.id)).size).toBe(r.issues.length);
  });

  it("gives every issue a family key that exists in the report", () => {
    const rows = [
      parent(2, "P1"),
      child(3, "C1", "P1", { size_name: "" }),
      child(4, "C2", "GONE"),
      clean(5, "S1", { main_image_url: "" }),
    ];
    const r = runChecks(rows, exampleRules);
    const keys = new Set(r.families.map((f) => f.key));
    expect(r.issues.length).toBeGreaterThan(0);
    for (const i of r.issues) expect(keys.has(i.family)).toBe(true);
  });

  it("has no em dashes in any message", () => {
    const rows = [
      parent(2, "P1"),
      child(3, "C1", "P1", { size_name: "", variation_theme: "Size" }),
      child(4, "C2", "GONE", { standard_price: "", main_image_url: "", item_name: "FREE shipping!" }),
      row(5),
      clean(6, "S1", { feed_product_type: "HAT" }),
    ];
    const r = runChecks(rows, exampleRules);
    for (const i of r.issues) {
      expect(i.problem).not.toContain("\u2014");
      expect(i.suggestedFix).not.toContain("\u2014");
    }
  });
});

describe("CHECK_DESCRIPTIONS", () => {
  const all: IssueCode[] = [
    "orphan-child",
    "childless-parent",
    "theme-mismatch",
    "duplicate-variant",
    "missing-theme-attribute",
    "missing-required",
    "unknown-product-type",
    "duplicate-sku",
    "duplicate-external-id",
    "duplicate-style",
    "near-duplicate-title",
    "title-too-long",
    "banned-phrase",
    "all-caps-word",
    "title-brand-prefix",
    "bullet-count",
    "bullet-too-long",
    "missing-sku",
    "missing-image",
    "missing-price",
    "sale-above-list",
  ];
  it("covers every issue code with a one-sentence summary and no em dash", () => {
    expect(Object.keys(CHECK_DESCRIPTIONS).sort()).toEqual([...all].sort());
    for (const code of all) {
      const d = CHECK_DESCRIPTIONS[code];
      expect(d.summary.length).toBeGreaterThan(20);
      expect(d.summary).not.toContain("\u2014");
    }
  });
  it("agrees with the severities the checks emit", () => {
    const rows = [
      parent(2, "P1"),
      child(3, "C1", "GONE", { standard_price: "", item_name: "Marlow Dress!" }),
    ];
    for (const i of runChecks(rows, exampleRules).issues) {
      expect(i.severity).toBe(CHECK_DESCRIPTIONS[i.code].severity);
      expect(i.check).toBe(CHECK_DESCRIPTIONS[i.code].check);
    }
  });
});

describe("validateRuleSet", () => {
  it("accepts the example rules", () => {
    const res = validateRuleSet(JSON.parse(JSON.stringify(exampleRules)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rules).toEqual(exampleRules);
  });
  it("uppercases product type keys", () => {
    const rules = { ...exampleRules, productTypes: { dress: { required: ["item_name"] } } };
    const res = validateRuleSet(rules);
    expect(res.ok && Object.keys(res.rules.productTypes)).toEqual(["DRESS"]);
  });
  it("lists every problem in plain sentences", () => {
    const res = validateRuleSet({
      label: 5,
      productTypes: { DRESS: { required: "item_name" } },
      parentRequired: [1],
      content: {
        titleMaxLength: -1,
        bannedPhrases: "sale",
        minBullets: 6,
        maxBullets: 2,
        bulletMaxLength: 1.5,
        allCapsAllowed: [],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThanOrEqual(6);
      for (const e of res.errors) expect(e).not.toContain("\u2014");
    }
  });
  it("rejects non-objects and missing sections", () => {
    expect(validateRuleSet(null).ok).toBe(false);
    expect(validateRuleSet([]).ok).toBe(false);
    expect(validateRuleSet("x").ok).toBe(false);
    const res = validateRuleSet({ label: "x" });
    expect(res.ok).toBe(false);
  });
  it("rejects prototype-pollution keys and does not mutate Object.prototype", () => {
    const evil = JSON.parse(
      '{"label":"x","productTypes":{"__proto__":{"required":["item_name"]}},"parentRequired":[],"content":{"titleMaxLength":150,"bannedPhrases":[],"minBullets":0,"maxBullets":5,"bulletMaxLength":255,"allCapsAllowed":[]}}',
    );
    const res = validateRuleSet(evil);
    expect(res.ok).toBe(false);
    expect(({} as Record<string, unknown>).required).toBeUndefined();
  });
  it("rejects minBullets above maxBullets", () => {
    const res = validateRuleSet({
      ...exampleRules,
      content: { ...exampleRules.content, minBullets: 4, maxBullets: 3 },
    });
    expect(res.ok).toBe(false);
  });
});
