import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { checkBasics } from "../src/rules/basics.ts";
import { child, clean, exampleRules, parent, row } from "./fixtures.ts";
import type { Row } from "../src/types.ts";

const run = (rows: Row[]) => checkBasics(buildCatalog(rows), exampleRules);

describe("basics: clean twin", () => {
  it("is silent on clean rows and on parents without prices or images", () => {
    expect(run([clean(2, "S1"), parent(3, "P1"), child(4, "C1", "P1", { sale_price: "50.00" })])).toEqual([]);
  });
});

describe("missing-sku", () => {
  it("fires for a blank SKU without dropping the row", () => {
    const issues = run([
      row(2, { item_name: "No SKU", standard_price: "10", main_image_url: "https://example.com/a.jpg" }),
    ]);
    expect(issues.map((i) => i.id)).toEqual(["missing-sku:2:item_sku"]);
    expect(issues[0].sku).toBe("");
    expect(issues[0].severity).toBe("blocking");
    expect(issues[0].problem).toContain("Row 2");
    expect(issues[0].family).toBe("row:2");
  });
  it("fires on parent rows as well", () => {
    expect(run([parent(2, "")]).map((i) => i.code)).toEqual(["missing-sku"]);
  });
});

describe("missing-image", () => {
  it("fires for a non-parent row only", () => {
    const issues = run([clean(2, "S1", { main_image_url: "" }), parent(3, "P1")]);
    expect(issues.map((i) => i.id)).toEqual(["missing-image:2:main_image_url"]);
    expect(issues[0].severity).toBe("blocking");
  });
});

describe("missing-price", () => {
  it("uses a different sentence for blank, zero, and unreadable prices", () => {
    const issues = run([
      clean(2, "S1", { standard_price: "" }),
      clean(3, "S2", { standard_price: "0" }),
      clean(4, "S3", { standard_price: "$0.00" }),
      clean(5, "S4", { standard_price: "call us" }),
    ]);
    expect(issues.every((i) => i.code === "missing-price" && i.field === "standard_price")).toBe(true);
    expect(issues.length).toBe(4);
    expect(issues[0].problem).not.toBe(issues[1].problem);
    expect(issues[1].problem.replace("S2", "S3")).toContain("0");
    expect(issues[2].problem).toContain("$0.00");
    expect(issues[3].problem).toContain("call us");
    expect(issues[0].severity).toBe("blocking");
  });
  it("skips parent rows", () => {
    expect(run([parent(2, "P1", { standard_price: "" })])).toEqual([]);
  });
});

describe("sale-above-list", () => {
  it("fires only when sale is greater than list", () => {
    const issues = run([
      clean(2, "S1", { standard_price: "68.00", sale_price: "80.00" }),
      clean(3, "S2", { standard_price: "68.00", sale_price: "68.00" }),
      clean(4, "S3", { standard_price: "$68", sale_price: "$59.99" }),
    ]);
    expect(issues.map((i) => i.id)).toEqual(["sale-above-list:2:sale_price"]);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].problem).toContain("80.00");
    expect(issues[0].problem).toContain("68.00");
  });
  it("ignores an unreadable sale price", () => {
    expect(run([clean(2, "S1", { sale_price: "soon" })])).toEqual([]);
  });
});
