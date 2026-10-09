import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { checkRequired } from "../src/rules/required.ts";
import { child, clean, exampleRules, parent } from "./fixtures.ts";
import type { Row } from "../src/types.ts";

const run = (rows: Row[]) => checkRequired(buildCatalog(rows), exampleRules);

describe("missing-required", () => {
  it("is silent on clean parent, child, and standalone rows", () => {
    expect(run([parent(2, "P1"), child(3, "C1", "P1"), clean(4, "S1")])).toEqual([]);
  });
  it("fires for each blank required field on a known product type", () => {
    const issues = run([clean(2, "S1", { material_type: "", department_name: "" })]);
    expect(issues.map((i) => i.id).sort()).toEqual([
      "missing-required:2:department_name",
      "missing-required:2:material_type",
    ]);
    expect(issues[0].severity).toBe("blocking");
    expect(issues[0].problem).toContain("DRESS");
  });
  it("matches the product type case-insensitively", () => {
    const issues = run([clean(2, "S1", { feed_product_type: "dress", material_type: "" })]);
    expect(issues.map((i) => i.code)).toEqual(["missing-required"]);
  });
  it("reports one issue on feed_product_type when it is blank", () => {
    const issues = run([clean(2, "S1", { feed_product_type: "", material_type: "" })]);
    expect(issues.map((i) => i.id)).toEqual(["missing-required:2:feed_product_type"]);
  });
  it("checks parents against parentRequired, not the product type list", () => {
    const issues = run([parent(2, "P1", { variation_theme: "", brand_name: "" }), child(3, "C1", "P1")]);
    expect(issues.map((i) => i.id).sort()).toEqual([
      "missing-required:2:brand_name",
      "missing-required:2:variation_theme",
    ]);
  });
  it("does not require size or color on a parent", () => {
    expect(run([parent(2, "P1", { size_name: "", color_name: "" }), child(3, "C1", "P1")])).toEqual([]);
  });
});

describe("unknown-product-type", () => {
  it("fires as a warning and suppresses missing-required for that row", () => {
    const issues = run([clean(2, "S1", { feed_product_type: "HAT", material_type: "" })]);
    expect(issues.map((i) => i.code)).toEqual(["unknown-product-type"]);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].field).toBe("feed_product_type");
    expect(issues[0].problem).toContain('"HAT"');
  });
  it("does not apply to parent rows", () => {
    expect(run([parent(2, "P1", { feed_product_type: "HAT" }), child(3, "C1", "P1")])).toEqual([]);
  });
});
