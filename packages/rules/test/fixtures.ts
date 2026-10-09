import type { Issue, IssueCode, Row } from "../src/types.ts";
import { exampleRules } from "../src/index.ts";

export { exampleRules };

/** A bare row: whatever fields you pass, nothing else. */
export function row(rowNumber: number, fields: Record<string, string> = {}): Row {
  return { rowNumber, fields: { ...fields } };
}

/** A standalone row that passes every check in the example rules. */
export function clean(rowNumber: number, sku: string, extra: Record<string, string> = {}): Row {
  return row(rowNumber, {
    item_sku: sku,
    feed_product_type: "DRESS",
    item_name: `Westbrook & Co. ${sku} Wrap Dress`,
    brand_name: "Westbrook & Co.",
    external_product_id: `04${String(rowNumber).padStart(10, "0")}`,
    style_number: `ST-${sku}`,
    size_name: "M",
    color_name: "Navy",
    department_name: "Womens",
    material_type: "Cotton",
    bullet_point1: "Soft cotton jersey",
    bullet_point2: "Wraps at the waist",
    bullet_point3: "Falls below the knee",
    bullet_point4: "Machine washable",
    bullet_point5: "Made in Portugal",
    main_image_url: `https://example.com/img/${sku}.jpg`,
    standard_price: "68.00",
    sale_price: "",
    ...extra,
  });
}

/** A parent row that passes every check. */
export function parent(rowNumber: number, sku: string, extra: Record<string, string> = {}): Row {
  return row(rowNumber, {
    item_sku: sku,
    parent_child: "Parent",
    variation_theme: "SizeColor",
    feed_product_type: "DRESS",
    item_name: `Westbrook & Co. ${sku} Wrap Dress`,
    brand_name: "Westbrook & Co.",
    style_number: `ST-${sku}`,
    ...extra,
  });
}

/** A child row that passes every check. */
export function child(
  rowNumber: number,
  sku: string,
  parentSku: string,
  extra: Record<string, string> = {},
): Row {
  return clean(rowNumber, sku, {
    parent_child: "Child",
    parent_sku: parentSku,
    style_number: `ST-${parentSku}`,
    size_name: `S${rowNumber}`,
    ...extra,
  });
}

export function codesOf(issues: Issue[], code?: IssueCode): string[] {
  return issues.filter((i) => code === undefined || i.code === code).map((i) => i.id);
}
