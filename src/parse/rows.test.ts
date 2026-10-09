import { describe, expect, it } from "vitest";
import { detectMapping } from "./headers.ts";
import { toRows } from "./rows.ts";

describe("toRows", () => {
  const table = [
    ["TemplateType=fptcustom", "Version=2024.0911", "", "", ""],
    ["Seller SKU", "Item Name", "Brand Name", "Parentage", "Warehouse Bin"],
    ["item_sku", "item_name", "brand_name", "parent_child", "Warehouse Bin"],
    ["WB-1001", "  Marlow Wrap Dress ", "Westbrook & Co.", "parent", "A-12"],
    ["", "", "", "", ""],
    ["WB-1001-NVY-M", "Marlow Wrap Dress, Navy", "Westbrook & Co.", "child", ""],
  ];
  const headerRow = 2;
  const { mapping } = detectMapping(table[headerRow]);

  it("numbers rows by their 1-based line in the sheet, after a three-row header", () => {
    const rows = toRows(table, headerRow, mapping);
    expect(rows.map((r) => r.rowNumber)).toEqual([4, 6]);
  });

  it("puts mapped columns under canonical keys and trims values", () => {
    const [first] = toRows(table, headerRow, mapping);
    expect(first.fields.item_sku).toBe("WB-1001");
    expect(first.fields.item_name).toBe("Marlow Wrap Dress");
    expect(first.fields.parent_child).toBe("parent");
  });

  it("keeps unmapped columns under their normalized header", () => {
    const rows = toRows(table, headerRow, mapping);
    expect(rows[0].fields.warehouse_bin).toBe("A-12");
    expect(rows[1].fields.warehouse_bin).toBe("");
  });

  it("gives every canonical field a value, empty when the file has no such column", () => {
    const [first] = toRows(table, headerRow, mapping);
    expect(first.fields.size_name).toBe("");
    expect(first.fields.bullet_point5).toBe("");
  });

  it("skips blank rows but keeps later row numbers true", () => {
    const rows = toRows(table, headerRow, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[1].fields.item_sku).toBe("WB-1001-NVY-M");
  });

  it("uses a user-chosen mapping and ignores the old column when it was set to null", () => {
    const t = [
      ["id", "sku", "name"],
      ["1", "WB-1", "Dress"],
    ];
    const custom = detectMapping(t[0]).mapping;
    custom.item_sku = 1;
    custom.item_name = 2;
    const [r] = toRows(t, 0, custom);
    expect(r.fields.item_sku).toBe("WB-1");
    expect(r.fields.item_name).toBe("Dress");
    expect(r.fields.id).toBe("1");

    const unmapped = { ...custom, item_sku: null };
    const [r2] = toRows(
      [
        ["item_sku", "name"],
        ["WB-1", "Dress"],
      ],
      0,
      { ...unmapped, item_name: 1 },
    );
    expect(r2.fields.item_sku).toBe("");
  });

  it("does not let an unmapped column overwrite a mapped one with the same name", () => {
    const t = [
      ["sku", "title", "item_name"],
      ["WB-1", "Real title", "Stray"],
    ];
    const m = detectMapping(t[0]).mapping;
    expect(m.item_name).toBe(2);
    const forced = { ...m, item_name: 1 };
    const [r] = toRows(t, 0, forced);
    expect(r.fields.item_name).toBe("Real title");
  });

  it("treats short rows as having empty trailing cells", () => {
    const t = [["sku", "title", "brand"], ["WB-1"]];
    const [r] = toRows(t, 0, detectMapping(t[0]).mapping);
    expect(r.fields.item_sku).toBe("WB-1");
    expect(r.fields.item_name).toBe("");
  });

  it("returns no rows when nothing follows the header", () => {
    expect(toRows([["sku", "title"]], 0, detectMapping(["sku", "title"]).mapping)).toEqual([]);
  });

  it("treats whitespace-only rows as blank", () => {
    const t = [
      ["sku", "title"],
      ["  ", "\t"],
      ["WB-2", "Coat"],
    ];
    const rows = toRows(t, 0, detectMapping(t[0]).mapping);
    expect(rows.map((r) => r.rowNumber)).toEqual([3]);
  });
});
