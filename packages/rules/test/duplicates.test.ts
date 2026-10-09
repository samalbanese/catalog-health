import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { checkDuplicates } from "../src/rules/duplicates.ts";
import { child, clean, exampleRules, parent, row } from "./fixtures.ts";
import type { IssueCode, Row } from "../src/types.ts";

const run = (rows: Row[], code?: IssueCode) =>
  checkDuplicates(buildCatalog(rows), exampleRules).filter((i) => code === undefined || i.code === code);

describe("duplicates: clean twin", () => {
  it("is silent on distinct rows", () => {
    expect(run([clean(2, "S1"), clean(3, "S2"), parent(4, "P1"), child(5, "C1", "P1")])).toEqual([]);
  });
});

describe("duplicate-sku", () => {
  it("fires on the second and later row, naming both row numbers", () => {
    const issues = run([clean(2, "S1"), clean(3, "S2"), clean(4, "S1"), clean(5, "S1")], "duplicate-sku");
    expect(issues.map((i) => i.id)).toEqual(["duplicate-sku:4:item_sku", "duplicate-sku:5:item_sku"]);
    expect(issues[0].problem).toContain("row 2");
    expect(issues[0].problem).toContain("row 4");
    expect(issues[0].related).toEqual(["S1"]);
    expect(issues[0].severity).toBe("blocking");
  });
  it("ignores blank SKUs", () => {
    expect(run([row(2, { item_name: "a" }), row(3, { item_name: "b" })], "duplicate-sku")).toEqual([]);
  });
});

describe("duplicate-external-id", () => {
  it("flags every row in the group and ignores spaces and leading zeros", () => {
    const issues = run(
      [
        clean(2, "S1", { external_product_id: "041234567890" }),
        clean(3, "S2", { external_product_id: "0 4123 4567 890" }),
        clean(4, "S3", { external_product_id: "0041234567890" }),
        clean(5, "S4"),
      ],
      "duplicate-external-id",
    );
    expect(issues.map((i) => i.rowNumber)).toEqual([2, 3, 4]);
    expect(issues[0].related).toEqual(["S2", "S3"]);
    expect(issues[1].related).toEqual(["S1", "S3"]);
    expect(issues[0].field).toBe("external_product_id");
    expect(issues[0].severity).toBe("blocking");
  });
  it("skips parent rows and blank ids", () => {
    const issues = run(
      [
        parent(2, "P1", { external_product_id: "041234567890" }),
        child(3, "C1", "P1", { external_product_id: "041234567890" }),
        clean(4, "S1", { external_product_id: "" }),
        clean(5, "S2", { external_product_id: "" }),
      ],
      "duplicate-external-id",
    );
    expect(issues).toEqual([]);
  });
});

describe("duplicate-style", () => {
  it("fires once per family on its head row", () => {
    const issues = run(
      [
        parent(2, "P1", { style_number: "WB-1001" }),
        child(3, "P1-A", "P1", { style_number: "WB-1001" }),
        child(4, "P1-B", "P1", { style_number: "WB-1001" }),
        clean(5, "S1", { style_number: " wb-1001 " }),
      ],
      "duplicate-style",
    );
    expect(issues.map((i) => i.id)).toEqual([
      "duplicate-style:2:style_number",
      "duplicate-style:5:style_number",
    ]);
    expect(issues[0].related).toEqual(["S1"]);
    expect(issues[1].related).toEqual(["P1"]);
    expect(issues[0].severity).toBe("warning");
  });
  it("is silent when one family uses its style on every row", () => {
    const rows = [
      parent(2, "P1", { style_number: "WB-1001" }),
      child(3, "P1-A", "P1", { style_number: "WB-1001" }),
    ];
    expect(run(rows, "duplicate-style")).toEqual([]);
  });
  it("ignores blank styles", () => {
    const rows = [clean(2, "S1", { style_number: "" }), clean(3, "S2", { style_number: "" })];
    expect(run(rows, "duplicate-style")).toEqual([]);
  });
});

describe("near-duplicate-title", () => {
  const base = {
    item_name: "Westbrook & Co. Marlow Wrap Dress, Navy, M",
    color_name: "Navy",
    size_name: "M",
  };
  it("fires once per family when two families share a title signature", () => {
    const issues = run(
      [
        parent(2, "P1"),
        child(3, "P1-M", "P1", { ...base }),
        child(4, "P1-L", "P1", {
          ...base,
          item_name: "Westbrook & Co. Marlow Wrap Dress, Navy, L",
          size_name: "L",
        }),
        parent(5, "P2"),
        child(6, "P2-M", "P2", { ...base, item_name: "westbrook & co. wrap dress marlow navy m" }),
      ],
      "near-duplicate-title",
    );
    expect(issues.map((i) => i.id)).toEqual([
      "near-duplicate-title:3:item_name",
      "near-duplicate-title:6:item_name",
    ]);
    expect(issues[0].related).toEqual(["P2-M"]);
    expect(issues[1].related).toEqual(["P1-M"]);
    expect(issues[0].severity).toBe("warning");
  });
  it("does not fire for same-title siblings in one family or for different colors", () => {
    const rows = [
      parent(2, "P1"),
      child(3, "P1-M", "P1", { ...base }),
      child(4, "P1-L", "P1", { ...base, size_name: "L" }),
      clean(5, "S1", { ...base, color_name: "Red" }),
    ];
    expect(run(rows, "near-duplicate-title")).toEqual([]);
  });
  it("removes the size as a whole word, not as a substring", () => {
    const issues = run(
      [
        clean(2, "S1", { item_name: "Medley Dress M", size_name: "M", color_name: "Navy" }),
        clean(3, "S2", { item_name: "Edley Dress", size_name: "M", color_name: "Navy" }),
      ],
      "near-duplicate-title",
    );
    expect(issues).toEqual([]);
  });
  it("skips parent rows", () => {
    const rows = [
      parent(2, "P1", { item_name: "Marlow Wrap Dress" }),
      parent(3, "P2", { item_name: "Marlow Wrap Dress" }),
    ];
    expect(run(rows, "near-duplicate-title")).toEqual([]);
  });
});
