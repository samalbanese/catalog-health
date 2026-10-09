import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { child, clean, parent, row } from "./fixtures.ts";

describe("buildCatalog", () => {
  it("groups children under their parent, in order of first appearance", () => {
    const rows = [
      clean(2, "S1"),
      parent(3, "P1"),
      child(4, "P1-A", "P1"),
      child(5, "P1-B", "P1"),
      parent(6, "P2"),
      child(7, "P2-A", "P2"),
    ];
    const c = buildCatalog(rows);
    expect([...c.families.keys()]).toEqual(["S1", "P1", "P2"]);
    expect(c.families.get("P1")?.kind).toBe("family");
    expect(c.families.get("P1")?.parent?.rowNumber).toBe(3);
    expect(c.families.get("P1")?.children.map((r) => r.rowNumber)).toEqual([4, 5]);
    expect(c.families.get("S1")?.kind).toBe("standalone");
    expect(c.familyOf.get(5)).toBe("P1");
    expect(c.familyOf.get(2)).toBe("S1");
    expect(c.familyOf.size).toBe(rows.length);
  });

  it("attaches a child that appears before its parent", () => {
    const c = buildCatalog([child(2, "P1-A", "P1"), parent(3, "P1")]);
    expect(c.families.get("P1")?.children.map((r) => r.rowNumber)).toEqual([2]);
    expect(c.families.get("P1")?.kind).toBe("family");
    expect(c.familyOf.get(2)).toBe("P1");
  });

  it("puts orphans that point at the same missing parent in one family", () => {
    const c = buildCatalog([child(2, "X-A", "GONE"), child(3, "X-B", "GONE"), child(4, "Y-A", "OTHER")]);
    const fam = c.families.get("GONE");
    expect(fam?.kind).toBe("orphans");
    expect(fam?.parent).toBeNull();
    expect(fam?.children.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(c.families.get("OTHER")?.children.length).toBe(1);
  });

  it("keys a blank-parent orphan by its own SKU label", () => {
    const c = buildCatalog([
      row(2, { item_sku: "LOST", parent_child: "Child" }),
      row(3, { parent_child: "Child" }),
    ]);
    expect(c.families.get("orphan:LOST")?.kind).toBe("orphans");
    expect(c.families.get("orphan:(row 3)")?.kind).toBe("orphans");
  });

  it("treats a child that points at a non-parent row as an orphan under that SKU", () => {
    const c = buildCatalog([clean(2, "S1"), child(3, "C1", "S1")]);
    expect(c.families.get("S1")?.kind).toBe("standalone");
    expect(c.families.get("orphan:S1")?.kind).toBe("orphans");
    expect(c.familyOf.get(3)).toBe("orphan:S1");
  });

  it("gives a blank-SKU row its own row key and keeps it in the catalog", () => {
    const c = buildCatalog([row(2, { item_name: "No SKU" }), clean(3, "S1")]);
    expect(c.families.get("row:2")?.kind).toBe("standalone");
    expect(c.familyOf.get(2)).toBe("row:2");
    expect(c.bySku.has("")).toBe(false);
  });

  it("handles a repeated parent SKU without crashing: the first is the family, the repeat is standalone", () => {
    const c = buildCatalog([parent(2, "P1"), child(3, "P1-A", "P1"), parent(4, "P1")]);
    expect(c.bySku.get("P1")?.rowNumber).toBe(2);
    expect(c.families.get("P1")?.kind).toBe("family");
    expect(c.families.get("P1")?.children.length).toBe(1);
    expect(c.families.get("row:4")?.kind).toBe("standalone");
    expect(c.familyOf.get(4)).toBe("row:4");
  });

  it("handles a repeated standalone SKU", () => {
    const c = buildCatalog([clean(2, "S1"), clean(3, "S1")]);
    expect(c.bySku.get("S1")?.rowNumber).toBe(2);
    expect(c.families.get("row:3")?.kind).toBe("standalone");
  });

  it("handles a parent with a blank SKU", () => {
    const c = buildCatalog([parent(2, ""), child(3, "C1", "")]);
    expect(c.families.get("row:2")?.kind).toBe("standalone");
    expect(c.families.get("orphan:C1")?.kind).toBe("orphans");
  });
});
