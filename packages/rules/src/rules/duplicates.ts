import type { Check, Family, Issue, Row } from "../types.ts";
import { headRow, makeIssue } from "../catalog.ts";
import { get, norm, parentage, skuLabel, who, capitalize } from "../normalize.ts";

/**
 * Collects items by key, but only keeps a list for keys seen more than once,
 * so a 70,000-row file doesn't allocate 70,000 one-item arrays.
 */
class Repeats<T> {
  private firsts = new Map<string, T>();
  private lists = new Map<string, T[]>();

  add(key: string, item: T): void {
    const first = this.firsts.get(key);
    if (first === undefined) {
      this.firsts.set(key, item);
      return;
    }
    const list = this.lists.get(key);
    if (list === undefined) this.lists.set(key, [first, item]);
    else list.push(item);
  }

  /** Only the keys that were added at least twice, with items in the order added. */
  repeated(): IterableIterator<[string, T[]]> {
    return this.lists.entries();
  }
}

/** Barcode with spaces and leading zeros removed, so a UPC and its zero-padded EAN match. */
function normalizeId(id: string): string {
  const compact = /\s/.test(id) ? id.replace(/\s+/g, "") : id;
  let start = 0;
  while (start < compact.length && compact.charCodeAt(start) === 48) start++;
  return start === 0 ? compact : compact.slice(start);
}

/** How many other rows or families a duplicate message names before it says "and N more". */
const MAX_NAMED = 5;

/**
 * The first MAX_NAMED items of `group` other than `self` (which must be in the group), and how
 * many more there are. Each call reads at most MAX_NAMED + 1 items, so a barcode shared by
 * thousands of rows stays linear instead of listing every row in every message.
 */
function othersOf<T>(group: T[], self: T): { shown: T[]; more: number } {
  const shown: T[] = [];
  for (const item of group) {
    if (shown.length === MAX_NAMED) break;
    if (item !== self) shown.push(item);
  }
  return { shown, more: group.length - 1 - shown.length };
}

function listNames(names: string[], more: number): string {
  return more > 0 ? `${names.join(", ")}, and ${more.toLocaleString("en-US")} more` : names.join(", ");
}

function skusOf(rows: Row[]): string[] {
  return [...new Set(rows.map((r) => get(r, "item_sku")).filter((s) => s !== ""))];
}

const TOKEN = /[a-z0-9]+/g;
const sizeWordCache = new Map<string, string[]>();
const normCache = new Map<string, string>();

function words(text: string): string[] {
  return text.toLowerCase().match(TOKEN) ?? [];
}

/** norm() for values that repeat a lot (brand, color, style), so each distinct text is normalized once. */
function normOnce(text: string): string {
  let out = normCache.get(text);
  if (out === undefined) {
    out = norm(text);
    normCache.set(text, out);
  }
  return out;
}

/** Title words with the row's own size removed (as whole words), sorted and deduplicated. */
function titleTokens(row: Row): string {
  const all = words(get(row, "item_name"));
  const size = get(row, "size_name");
  let sizeWords = sizeWordCache.get(size);
  if (sizeWords === undefined) {
    sizeWords = words(size);
    sizeWordCache.set(size, sizeWords);
  }
  let kept = all;
  if (sizeWords.length > 0) {
    kept = [];
    for (let i = 0; i < all.length;) {
      let hit = true;
      for (let k = 0; k < sizeWords.length; k++) {
        if (all[i + k] !== sizeWords[k]) {
          hit = false;
          break;
        }
      }
      if (hit) i += sizeWords.length;
      else kept.push(all[i++]);
    }
  }
  kept.sort();
  let out = "";
  for (let i = 0; i < kept.length; i++) {
    if (i > 0 && kept[i] === kept[i - 1]) continue;
    out = out === "" ? kept[i] : `${out} ${kept[i]}`;
  }
  return out;
}

export const checkDuplicates: Check = (catalog) => {
  const issues: Issue[] = [];

  // duplicate-sku: every row after the first with the same SKU.
  for (const row of catalog.rows) {
    const sku = get(row, "item_sku");
    if (sku === "") continue;
    const first = catalog.bySku.get(sku);
    if (first === undefined || first === row) continue;
    issues.push(
      makeIssue(
        catalog,
        row,
        "duplicate-sku",
        "item_sku",
        `SKU ${sku} on row ${row.rowNumber} repeats the SKU on row ${first.rowNumber}.`,
        "Give every row its own item_sku, or delete the repeated row.",
        [sku],
      ),
    );
  }

  // duplicate-external-id: sellable rows sharing a barcode. Everyone in the group is flagged.
  const byId = new Repeats<Row>();
  for (const row of catalog.rows) {
    if (parentage(row) === "parent") continue;
    const id = normalizeId(get(row, "external_product_id"));
    if (id !== "") byId.add(id, row);
  }
  for (const [, group] of byId.repeated()) {
    for (const row of group) {
      const { shown, more } = othersOf(group, row);
      const names = listNames(
        shown.map((r) => `${who(r)} (row ${r.rowNumber})`),
        more,
      );
      issues.push(
        makeIssue(
          catalog,
          row,
          "duplicate-external-id",
          "external_product_id",
          `${capitalize(who(row))} has the barcode ${get(row, "external_product_id")}, which is also used by ${names}.`,
          "Give each product its own barcode, or remove the repeated row.",
          skusOf(shown),
        ),
      );
    }
  }

  // duplicate-style: one style number shared by two or more families.
  const styleFamilies = new Repeats<Family>();
  for (const family of catalog.families.values()) {
    const styles: string[] = [];
    const addStyle = (r: Row): void => {
      const style = normOnce(get(r, "style_number"));
      if (style !== "" && !styles.includes(style)) styles.push(style);
    };
    if (family.parent !== null) addStyle(family.parent);
    for (const r of family.children) addStyle(r);
    for (const style of styles) styleFamilies.add(style, family);
  }
  const styleSeen = new Set<string>();
  for (const [style, families] of styleFamilies.repeated()) {
    for (const family of families) {
      const head = headRow(family);
      if (head === null) continue;
      const id = `duplicate-style:${head.rowNumber}:style_number`;
      if (styleSeen.has(id)) continue;
      styleSeen.add(id);
      const { shown, more } = othersOf(families, family);
      const heads = shown.map(headRow).filter((r): r is Row => r !== null);
      const names = listNames(
        heads.map((r) => skuLabel(r)),
        more,
      );
      issues.push(
        makeIssue(
          catalog,
          head,
          "duplicate-style",
          "style_number",
          `Style number ${style.toUpperCase()} is also used by ${families.length === 2 ? "another family" : "other families"}: ${names}.`,
          "Give each family its own style_number, or put them under one parent if they are the same style.",
          skusOf(heads),
        ),
      );
    }
  }

  // near-duplicate-title: same brand, color, and words once size is removed, in different families.
  const bySignature = new Repeats<Row>();
  for (const row of catalog.rows) {
    if (parentage(row) === "parent") continue;
    const tokens = titleTokens(row);
    if (tokens === "") continue;
    const signature = `${normOnce(get(row, "brand_name"))}|${normOnce(get(row, "color_name"))}|${tokens}`;
    bySignature.add(signature, row);
  }
  for (const [, group] of bySignature.repeated()) {
    // First row of each family, in file order.
    const firsts = new Map<string, Row>();
    for (const row of group) {
      const key = catalog.familyOf.get(row.rowNumber) ?? "";
      if (!firsts.has(key)) firsts.set(key, row);
    }
    if (firsts.size < 2) continue;
    const heads = [...firsts.values()];
    for (const row of heads) {
      const { shown, more } = othersOf(heads, row);
      issues.push(
        makeIssue(
          catalog,
          row,
          "near-duplicate-title",
          "item_name",
          `${capitalize(who(row))} has nearly the same title as ${listNames(
            shown.map((r) => `${who(r)} ("${get(r, "item_name")}")`),
            more,
          )}.`,
          "Make the titles clearly different, or combine these into one family if they are the same product.",
          skusOf(shown),
        ),
      );
    }
  }

  return issues;
};
