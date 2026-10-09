import type { CheckId, FieldKey, Severity } from "@relaywright/catalog-rules";

export const CHECK_LABELS: Record<CheckId, string> = {
  variations: "Variation families",
  required: "Required attributes",
  duplicates: "Duplicates",
  content: "Titles and bullets",
  basics: "Basics",
};

export const SEVERITY_LABELS: Record<Severity, { one: string; many: string }> = {
  blocking: { one: "blocking", many: "blocking" },
  warning: { one: "warning", many: "warnings" },
  tidy: { one: "tidy-up", many: "tidy-ups" },
};

export const SEVERITY_HELP: Record<Severity, string> = {
  blocking: "Stops a listing from going live or breaks its family.",
  warning: "Hurts search or shoppers, but the listing can go live.",
  tidy: "Small fixes that make the catalog consistent.",
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  item_sku: "SKU",
  parent_sku: "Parent SKU",
  parent_child: "Parent or child",
  variation_theme: "Variation theme",
  feed_product_type: "Product type",
  item_name: "Title",
  brand_name: "Brand",
  external_product_id: "UPC or EAN",
  style_number: "Style number",
  size_name: "Size",
  color_name: "Color",
  department_name: "Department",
  material_type: "Material",
  bullet_point1: "Bullet 1",
  bullet_point2: "Bullet 2",
  bullet_point3: "Bullet 3",
  bullet_point4: "Bullet 4",
  bullet_point5: "Bullet 5",
  main_image_url: "Main image URL",
  standard_price: "Price",
  sale_price: "Sale price",
};

export function fieldLabel(key: string): string {
  return (FIELD_LABELS as Record<string, string>)[key] ?? key;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const SEVERITY_RANK: Record<Severity, number> = { blocking: 0, warning: 1, tidy: 2 };
