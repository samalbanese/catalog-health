import { describe, expect, it } from "vitest";
import { get, norm, parentage, parsePrice, skuLabel, themeDims } from "../src/normalize.ts";
import { row } from "./fixtures.ts";

describe("get and norm", () => {
  it("returns an empty string for a missing field", () => {
    expect(get(row(2, { item_sku: "A" }), "item_sku")).toBe("A");
    expect(get(row(2), "item_sku")).toBe("");
  });
  it("lowercases, trims, and collapses whitespace", () => {
    expect(norm("  Navy   BLUE \t")).toBe("navy blue");
    expect(norm("")).toBe("");
  });
});

describe("parentage", () => {
  it("reads the parent_child column case-insensitively", () => {
    expect(parentage(row(2, { parent_child: " Parent " }))).toBe("parent");
    expect(parentage(row(2, { parent_child: "CHILD" }))).toBe("child");
  });
  it("treats a blank parent_child with a parent_sku as a child", () => {
    expect(parentage(row(2, { parent_sku: "P1" }))).toBe("child");
  });
  it("treats everything else as standalone", () => {
    expect(parentage(row(2))).toBe("standalone");
    expect(parentage(row(2, { parent_child: "weird", parent_sku: "P1" }))).toBe("standalone");
    expect(parentage(row(2, { parent_child: "parent", parent_sku: "P1" }))).toBe("parent");
  });
});

describe("themeDims", () => {
  it("treats every spelling of size and color the same", () => {
    for (const t of ["SizeColor", "ColorSize", "size-color", "Size/Colour", "COLOUR_NAME-SIZE_NAME"]) {
      expect(themeDims(t)).toEqual(["color", "size"]);
    }
  });
  it("finds a single dimension", () => {
    expect(themeDims("Size")).toEqual(["size"]);
    expect(themeDims("Colour")).toEqual(["color"]);
  });
  it("labels other themes and returns nothing for a blank theme", () => {
    expect(themeDims("Flavor")).toEqual(["other:flavor"]);
    expect(themeDims("")).toEqual([]);
    expect(themeDims("   ")).toEqual([]);
  });
});

describe("parsePrice", () => {
  it("strips currency symbols, commas, and spaces", () => {
    expect(parsePrice("$1,299.50")).toBe(1299.5);
    expect(parsePrice("£ 68")).toBe(68);
    expect(parsePrice("€12,00")).toBe(1200);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("$0.00")).toBe(0);
  });
  it("returns null for blank or unreadable values", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("  ")).toBeNull();
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("Infinity")).toBeNull();
  });
});

describe("skuLabel", () => {
  it("uses the SKU, or the row number when it is blank", () => {
    expect(skuLabel(row(7, { item_sku: "WB-1" }))).toBe("WB-1");
    expect(skuLabel(row(7))).toBe("(row 7)");
  });
});
