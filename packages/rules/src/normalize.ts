import type { Row } from "./types.ts";

/** A field's value, or "" when the row doesn't have it. */
export function get(row: Row, key: string): string {
  return row.fields[key] ?? "";
}

/** Lowercase, trim, and collapse runs of whitespace to one space. */
const ODD_SPACE = /[^\S ]| {2}/;
export function norm(s: string): string {
  const t = s.toLowerCase().trim();
  return ODD_SPACE.test(t) ? t.replace(/\s+/g, " ") : t;
}

export type Parentage = "parent" | "child" | "standalone";

export function parentage(row: Row): Parentage {
  const raw = get(row, "parent_child");
  // The two spellings real files use, answered without any string work.
  if (raw === "Child") return "child";
  if (raw === "Parent") return "parent";
  const pc = norm(raw);
  if (pc === "parent") return "parent";
  if (pc === "child") return "child";
  if (pc === "" && get(row, "parent_sku") !== "") return "child";
  return "standalone";
}

export type Dim = "size" | "color";

/** The attribute column that holds each variation dimension. */
export const DIM_FIELD: Record<Dim, string> = { size: "size_name", color: "color_name" };

export function isDim(value: string): value is Dim {
  return value === "size" || value === "color";
}

const themeCache = new Map<string, readonly string[]>();
const fieldDimCache = new Map<string, readonly Dim[]>();
const THEME_CACHE_LIMIT = 500;

/**
 * Which dimensions a variation theme varies on. "SizeColor", "Colour-Size" and
 * "size/color" all give ["color", "size"]. A theme with neither gives
 * ["other:<letters>"]; a blank theme gives []. The result is shared: don't change it.
 */
export function themeDims(theme: string): readonly string[] {
  const cached = themeCache.get(theme);
  if (cached !== undefined) return cached;
  const letters = theme.toLowerCase().replace(/[^a-z]/g, "");
  let dims: string[] = [];
  if (letters !== "") {
    if (letters.includes("color") || letters.includes("colour")) dims.push("color");
    if (letters.includes("size")) dims.push("size");
    if (dims.length === 0) dims = [`other:${letters}`];
    dims.sort();
  }
  if (themeCache.size >= THEME_CACHE_LIMIT) themeCache.clear();
  themeCache.set(theme, dims);
  return dims;
}

/** Size and color dimensions only, in the order themeDims returns them. Shared: don't change it. */
export function fieldDims(theme: string): readonly Dim[] {
  const cached = fieldDimCache.get(theme);
  if (cached !== undefined) return cached;
  const dims = themeDims(theme).filter(isDim);
  if (fieldDimCache.size >= THEME_CACHE_LIMIT) fieldDimCache.clear();
  fieldDimCache.set(theme, dims);
  return dims;
}

/** A price as a number, or null when it is blank or unreadable. */
export function parsePrice(s: string): number | null {
  const cleaned = s.replace(/[$£€,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The SKU, or "(row N)" for a row that has none. */
export function skuLabel(row: Row): string {
  const sku = get(row, "item_sku");
  return sku !== "" ? sku : `(row ${row.rowNumber})`;
}

/** How to name a row in a sentence: "SKU WB-1001", or "row 7" when it has no SKU. */
export function who(row: Row): string {
  const sku = get(row, "item_sku");
  return sku !== "" ? `SKU ${sku}` : `row ${row.rowNumber}`;
}

export const BULLET_KEYS = [
  "bullet_point1",
  "bullet_point2",
  "bullet_point3",
  "bullet_point4",
  "bullet_point5",
] as const;

/** "1 bullet point" / "3 bullet points". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
