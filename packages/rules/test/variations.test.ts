import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { checkVariations } from "../src/rules/variations.ts";
import { child, clean, exampleRules, parent, row } from "./fixtures.ts";
import type { Row } from "../src/types.ts";

const run = (rows: Row[]) => checkVariations(buildCatalog(rows), exampleRules);

describe("variations: clean twin", () => {
  it("is silent on a healthy family and a standalone row", () => {
    const rows = [
      parent(2, "P1"),
      child(3, "P1-S", "P1", { size_name: "S", color_name: "Navy" }),
      child(4, "P1-M", "P1", { size_name: "M", color_name: "Navy" }),
      child(5, "P1-MR", "P1", { size_name: "M", color_name: "Red" }),
      clean(6, "S1"),
    ];
    expect(run(rows)).toEqual([]);
  });
});

describe("orphan-child", () => {
  it("fires for a child with a blank parent_sku", () => {
    const [i, ...rest] = run([child(2, "C1", "")]);
    expect(rest).toEqual([]);
    expect(i.code).toBe("orphan-child");
    expect(i.severity).toBe("blocking");
    expect(i.field).toBe("parent_sku");
    expect(i.id).toBe("orphan-child:2:parent_sku");
    expect(i.related).toEqual([]);
    expect(i.problem).toContain("no parent_sku");
    expect(i.family).toBe("orphan:C1");
  });
  it("fires for a child whose parent is not in the file", () => {
    const [i] = run([child(2, "WB-1004-NVY-M", "WB-1099")]);
    expect(i.problem).toBe("Child SKU WB-1004-NVY-M points to parent WB-1099, which isn't in this file.");
    expect(i.suggestedFix).toBe("Add the parent row, or correct parent_sku.");
    expect(i.related).toEqual(["WB-1099"]);
  });
  it("fires for a child whose parent_sku points at a row that isn't a parent", () => {
    const [i] = run([clean(2, "S1"), child(3, "C1", "S1")]);
    expect(i.code).toBe("orphan-child");
    expect(i.problem).toContain("row 2");
    expect(i.problem).toContain("not a parent");
    expect(i.related).toEqual(["S1"]);
  });
  it("uses three different sentences", () => {
    const problems = new Set([
      run([child(2, "C1", "")])[0].problem,
      run([child(2, "C1", "GONE")])[0].problem,
      run([clean(2, "S1"), child(3, "C1", "S1")])[0].problem,
    ]);
    expect(problems.size).toBe(3);
  });
  it("names a blank-SKU child by its row number", () => {
    const [i] = run([row(4, { parent_child: "Child", parent_sku: "GONE" })]);
    expect(i.sku).toBe("");
    expect(i.problem).toContain("row 4");
  });
});

describe("childless-parent", () => {
  it("fires for a family parent with no children", () => {
    const issues = run([parent(2, "P1")]);
    expect(issues.map((i) => i.code)).toEqual(["childless-parent"]);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].field).toBe("");
    expect(issues[0].id).toBe("childless-parent:2:");
  });
  it("stays silent once a child points at it", () => {
    expect(run([parent(2, "P1"), child(3, "C1", "P1")])).toEqual([]);
  });
  it("does not fire for a repeated parent SKU that became standalone", () => {
    const issues = run([parent(2, "P1"), child(3, "C1", "P1"), parent(4, "P1")]);
    expect(issues.filter((i) => i.code === "childless-parent")).toEqual([]);
  });
});

describe("theme-mismatch", () => {
  it("fires when a child's theme differs from the parent's", () => {
    const issues = run([parent(2, "P1"), child(3, "C1", "P1", { variation_theme: "Size" })]);
    expect(issues.map((i) => i.code)).toEqual(["theme-mismatch"]);
    expect(issues[0].severity).toBe("blocking");
    expect(issues[0].field).toBe("variation_theme");
    expect(issues[0].related).toEqual(["P1"]);
    expect(issues[0].problem).toContain('"Size"');
    expect(issues[0].problem).toContain('"SizeColor"');
  });
  it("accepts a different spelling of the same dimensions", () => {
    expect(run([parent(2, "P1"), child(3, "C1", "P1", { variation_theme: "Colour-Size" })])).toEqual([]);
  });
  it("lets a blank child theme inherit", () => {
    expect(run([parent(2, "P1"), child(3, "C1", "P1", { variation_theme: "" })])).toEqual([]);
  });
});

describe("missing-theme-attribute", () => {
  it("fires once per blank dimension named by the parent theme", () => {
    const issues = run([parent(2, "P1"), child(3, "C1", "P1", { size_name: "", color_name: "" })]);
    expect(issues.map((i) => i.id).sort()).toEqual([
      "missing-theme-attribute:3:color_name",
      "missing-theme-attribute:3:size_name",
    ]);
    expect(issues[0].severity).toBe("blocking");
  });
  it("only checks the dimensions in the theme", () => {
    const issues = run([
      parent(2, "P1", { variation_theme: "Size" }),
      child(3, "C1", "P1", { size_name: "M", color_name: "" }),
    ]);
    expect(issues).toEqual([]);
  });
  it("falls back to the child's own theme when the parent has none", () => {
    const issues = run([
      parent(2, "P1", { variation_theme: "" }),
      child(3, "C1", "P1", { variation_theme: "Color", color_name: "" }),
    ]);
    // A blank parent theme is the parent's problem (missing-required), so no theme-mismatch on the child.
    expect(issues.map((i) => i.id).sort()).toEqual(["missing-theme-attribute:3:color_name"]);
  });
  it("checks orphans against their own theme", () => {
    const issues = run([child(2, "C1", "GONE", { variation_theme: "Size", size_name: "" })]);
    expect(issues.map((i) => i.code).sort()).toEqual(["missing-theme-attribute", "orphan-child"]);
  });
  it("ignores a theme with no size or color", () => {
    const rows = [
      parent(2, "P1", { variation_theme: "Flavor" }),
      child(3, "C1", "P1", { size_name: "", color_name: "" }),
    ];
    expect(run(rows)).toEqual([]);
  });
});

describe("duplicate-variant", () => {
  it("fires on the second and later child with the same size and color", () => {
    const issues = run([
      parent(2, "P1"),
      child(3, "C1", "P1", { size_name: "M", color_name: "Navy" }),
      child(4, "C2", "P1", { size_name: " m ", color_name: "NAVY" }),
      child(5, "C3", "P1", { size_name: "M", color_name: "Navy" }),
    ]);
    expect(issues.map((i) => i.id)).toEqual(["duplicate-variant:4:", "duplicate-variant:5:"]);
    expect(issues[0].related).toEqual(["C1"]);
    expect(issues[1].related).toEqual(["C1"]);
    expect(issues[0].severity).toBe("blocking");
  });
  it("skips children with a blank dimension, and families with no dimensions", () => {
    const blank = run([
      parent(2, "P1"),
      child(3, "C1", "P1", { size_name: "M", color_name: "" }),
      child(4, "C2", "P1", { size_name: "M", color_name: "" }),
    ]);
    expect(blank.filter((i) => i.code === "duplicate-variant")).toEqual([]);
    const noDims = run([
      parent(2, "P1", { variation_theme: "Flavor" }),
      child(3, "C1", "P1", { size_name: "M" }),
      child(4, "C2", "P1", { size_name: "M" }),
    ]);
    expect(noDims).toEqual([]);
  });
  it("does not compare children of different families", () => {
    const issues = run([
      parent(2, "P1"),
      child(3, "C1", "P1", { size_name: "M", color_name: "Navy" }),
      parent(4, "P2"),
      child(5, "C2", "P2", { size_name: "M", color_name: "Navy" }),
    ]);
    expect(issues).toEqual([]);
  });
});
