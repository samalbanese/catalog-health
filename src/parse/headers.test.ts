import { describe, expect, it } from "vitest";
import { FIELDS } from "@relaywright/catalog-rules";
import { ALIASES, detectHeaderRow, detectMapping, normalizeHeader } from "./headers.ts";

const MP = "[marketplace_id=ATVPDKIKX0DER]";
const LANG = "[language_tag=en_US]";

describe("normalizeHeader", () => {
  it("lowercases, trims, and turns separators into underscores", () => {
    expect(normalizeHeader("  Seller SKU ")).toBe("seller_sku");
    expect(normalizeHeader("Bullet-Point 1")).toBe("bullet_point_1");
  });

  it("drops bracket groups and turns #N.value into N", () => {
    expect(normalizeHeader(`item_name${MP}${LANG}#1.value`)).toBe("item_name1");
    expect(normalizeHeader(`bullet_point${MP}${LANG}#3.value`)).toBe("bullet_point3");
  });

  it("drops a trailing .value and keeps other suffixes readable", () => {
    expect(normalizeHeader("brand_name.value")).toBe("brand_name");
    expect(normalizeHeader(`child_parent_sku_relationship${MP}#1.parent_sku`)).toBe(
      "child_parent_sku_relationship1_parent_sku",
    );
  });

  it("returns an empty string for a header with no letters or digits", () => {
    expect(normalizeHeader(" -- ")).toBe("");
  });
});

describe("ALIASES", () => {
  it("lists every field and each field's own canonical name", () => {
    for (const f of FIELDS) {
      expect(ALIASES[f]).toContain(normalizeHeader(f));
    }
  });

  it("never gives the same alias to two fields", () => {
    const seen = new Map<string, string>();
    for (const f of FIELDS) {
      for (const a of ALIASES[f]) {
        expect(seen.get(a), `${a} is claimed by both ${seen.get(a)} and ${f}`).toBeUndefined();
        seen.set(a, f);
      }
    }
  });

  it("is already normalized", () => {
    for (const f of FIELDS) {
      for (const a of ALIASES[f]) expect(normalizeHeader(a)).toBe(a);
    }
  });
});

describe("detectHeaderRow", () => {
  it("finds the field-name row under a template-info row and a label row", () => {
    const table = [
      ["TemplateType=fptcustom", "Version=2024.0911", "TemplateSignature=Q09BVA==", "", ""],
      ["Seller SKU", "Product Type", "Item Name", "Brand Name", "Parentage"],
      ["item_sku", "feed_product_type", "item_name", "brand_name", "parent_child"],
      ["WB-1001", "DRESS", "Westbrook & Co. Marlow Wrap Dress", "Westbrook & Co.", "parent"],
    ];
    expect(detectHeaderRow(table)).toBe(2);
  });

  it("prefers the field-name row over a label row that matches just as many aliases", () => {
    const table = [
      ["Seller SKU", "Item Name", "Brand", "Size", "Color"],
      ["item_sku", "item_name", "brand_name", "size_name", "color_name"],
    ];
    expect(detectHeaderRow(table)).toBe(1);
  });

  it("finds a plain one-row header at index 0", () => {
    expect(
      detectHeaderRow([
        ["sku", "title", "parent"],
        ["WB-1", "A dress", ""],
      ]),
    ).toBe(0);
  });

  it("returns the earliest row on a full tie", () => {
    const table = [
      ["sku", "title"],
      ["sku", "title"],
    ];
    expect(detectHeaderRow(table)).toBe(0);
  });

  it("returns 0 when no row has two alias hits", () => {
    expect(detectHeaderRow([["foo", "bar"], ["sku", "baz"], ["x"]])).toBe(0);
    expect(detectHeaderRow([])).toBe(0);
  });

  it("only looks at the first 10 rows", () => {
    const filler = Array.from({ length: 10 }, () => ["x", "y"]);
    const table = [...filler, ["item_sku", "item_name", "brand_name"]];
    expect(detectHeaderRow(table)).toBe(0);
  });
});

describe("detectMapping", () => {
  it("maps bracketed new-style Amazon headers to canonical fields", () => {
    const headers = [
      `contribution_sku${MP}#1.value`,
      `item_name${MP}${LANG}#1.value`,
      `bullet_point${MP}${LANG}#1.value`,
      `bullet_point${MP}${LANG}#2.value`,
      `bullet_point${MP}${LANG}#3.value`,
      `parentage_level${MP}#1.value`,
      `child_parent_sku_relationship${MP}#1.parent_sku`,
      `brand${MP}${LANG}#1.value`,
      `purchasable_offer${MP}[currency=USD]#1.our_price#1.schedule#1.value_with_tax`,
    ];
    const { mapping, confident } = detectMapping(headers);
    expect(mapping.item_sku).toBe(0);
    expect(mapping.item_name).toBe(1);
    expect(mapping.bullet_point1).toBe(2);
    expect(mapping.bullet_point2).toBe(3);
    expect(mapping.bullet_point3).toBe(4);
    expect(mapping.bullet_point4).toBeNull();
    expect(mapping.parent_child).toBe(5);
    expect(mapping.parent_sku).toBe(6);
    expect(mapping.brand_name).toBe(7);
    expect(mapping.standard_price).toBe(8);
    expect(confident).toBe(true);
  });

  it("maps the lowercase item_name and bullet_point3 examples from the template", () => {
    const { mapping } = detectMapping([`item_name${MP}${LANG}#1.value`, `bullet_point${MP}${LANG}#3.value`]);
    expect(mapping.item_name).toBe(0);
    expect(mapping.bullet_point3).toBe(1);
  });

  it("maps common plain-language headers", () => {
    const headers = [
      "SKU",
      "Parent",
      "Title",
      "Brand",
      "UPC",
      "Model Number",
      "Colour",
      "Size",
      "Price",
      "Sale",
      "Main Image",
    ];
    const { mapping, unmapped } = detectMapping(headers);
    expect(mapping.item_sku).toBe(0);
    expect(mapping.parent_sku).toBe(1);
    expect(mapping.item_name).toBe(2);
    expect(mapping.brand_name).toBe(3);
    expect(mapping.external_product_id).toBe(4);
    expect(mapping.style_number).toBe(5);
    expect(mapping.color_name).toBe(6);
    expect(mapping.size_name).toBe(7);
    expect(mapping.standard_price).toBe(8);
    expect(mapping.sale_price).toBe(9);
    expect(mapping.main_image_url).toBe(10);
    expect(unmapped).toEqual([]);
  });

  it("maps the numbered bullet spellings", () => {
    const headers = ["Bullet Point 1", "bullet2", "Bullet_3", "key_product_features4", "bullet_point5"];
    const { mapping } = detectMapping(headers);
    expect(mapping.bullet_point1).toBe(0);
    expect(mapping.bullet_point2).toBe(1);
    expect(mapping.bullet_point3).toBe(2);
    expect(mapping.bullet_point4).toBe(3);
    expect(mapping.bullet_point5).toBe(4);
  });

  it("lists headers it could not place, skipping blank ones", () => {
    const { unmapped } = detectMapping(["sku", "title", "Warehouse Bin", "", "Fabric Weight"]);
    expect(unmapped).toEqual(["Warehouse Bin", "Fabric Weight"]);
  });

  it("flags two alias columns for one field: first wins, field is ambiguous, not confident", () => {
    const { mapping, ambiguous, confident } = detectMapping(["sku", "seller_sku", "title", "parent_sku"]);
    expect(mapping.item_sku).toBe(0);
    expect(ambiguous).toEqual(["item_sku"]);
    expect(confident).toBe(false);
  });

  it("lets an exact canonical column beat an alias column without flagging it", () => {
    const { mapping, ambiguous, confident } = detectMapping(["sku", "item_sku", "title", "parent_sku"]);
    expect(mapping.item_sku).toBe(1);
    expect(ambiguous).toEqual([]);
    expect(confident).toBe(true);
  });

  it("is confident with sku, title, and either parent column", () => {
    expect(detectMapping(["sku", "title", "parentage"]).confident).toBe(true);
    expect(detectMapping(["sku", "title", "parent_sku"]).confident).toBe(true);
  });

  it("is not confident without a title, a sku, or any parent column", () => {
    expect(detectMapping(["sku", "parent_sku"]).confident).toBe(false);
    expect(detectMapping(["title", "parent_sku"]).confident).toBe(false);
    expect(detectMapping(["sku", "title", "color"]).confident).toBe(false);
  });

  it("leaves every field null when nothing matches", () => {
    const { mapping, confident } = detectMapping(["a", "b"]);
    expect(Object.values(mapping).every((v) => v === null)).toBe(true);
    expect(Object.keys(mapping).sort()).toEqual([...FIELDS].sort());
    expect(confident).toBe(false);
  });
});
