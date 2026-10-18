import { FIELDS, type FieldKey } from "@samalbanese/catalog-rules";

/**
 * Turns any spelling of a column header into one comparable key.
 * `Seller SKU` becomes `seller_sku`. Amazon's newer templates add attribute
 * groups and indexes, so `bullet_point[marketplace_id=X][language_tag=en_US]#3.value`
 * becomes `bullet_point3`.
 */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/#(\d+)(?:\.value(?![a-z0-9_]))?/g, "$1")
    .replace(/\.value$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function bulletAliases(n: number): string[] {
  return [
    `bullet_point${n}`,
    `bullet_point_${n}`,
    `bulletpoint${n}`,
    `bullet${n}`,
    `bullet_${n}`,
    `key_product_features${n}`,
    `key_product_features_${n}`,
  ];
}

/** Every alias is already normalized. Each field also matches its own canonical name. */
export const ALIASES: Record<FieldKey, string[]> = {
  item_sku: ["item_sku", "sku", "seller_sku", "contribution_sku"],
  parent_sku: [
    "parent_sku",
    "parent",
    "parent_sku_id",
    "parent_item_sku",
    "child_parent_sku_relationship1_parent_sku",
  ],
  parent_child: ["parent_child", "parentage", "parentage_level"],
  variation_theme: ["variation_theme", "variation_theme_name", "variation_theme1_name"],
  feed_product_type: ["feed_product_type", "product_type"],
  item_name: ["item_name", "title", "product_name", "product_title", "item_title"],
  brand_name: ["brand_name", "brand"],
  external_product_id: ["external_product_id", "upc", "ean", "gtin", "barcode", "product_id", "upc_code"],
  style_number: [
    "style_number",
    "model",
    "model_number",
    "style",
    "style_id",
    "style_no",
    "style_code",
    "item_model_number",
  ],
  size_name: ["size_name", "size"],
  color_name: ["color_name", "color", "colour", "colour_name"],
  department_name: ["department_name", "department"],
  material_type: ["material_type", "material", "fabric_type", "material_composition"],
  bullet_point1: bulletAliases(1),
  bullet_point2: bulletAliases(2),
  bullet_point3: bulletAliases(3),
  bullet_point4: bulletAliases(4),
  bullet_point5: bulletAliases(5),
  main_image_url: [
    "main_image_url",
    "main_image",
    "image_url",
    "main_image_location",
    "main_image_link",
    "main_product_image_locator",
    "main_product_image_locator1_media_location",
  ],
  standard_price: [
    "standard_price",
    "price",
    "list_price",
    "your_price",
    "purchasable_offer",
    "purchasable_offer1_our_price1_schedule1_value_with_tax",
  ],
  sale_price: [
    "sale_price",
    "sale",
    "discounted_price",
    "purchasable_offer1_discounted_price1_schedule1_value_with_tax",
  ],
};

const LOOKUP = new Map<string, FieldKey>();
for (const field of FIELDS) {
  for (const alias of ALIASES[field]) {
    if (!LOOKUP.has(alias)) LOOKUP.set(alias, field);
  }
}

interface HeaderMatch {
  field: FieldKey;
  /** True when the header is the field's own canonical name, not just an alias. */
  canonical: boolean;
}

function matchHeader(raw: string): HeaderMatch | null {
  const key = normalizeHeader(raw);
  if (!key) return null;
  let field = LOOKUP.get(key);
  // Newer Amazon templates index the first value of a single-value attribute as #1,
  // which normalizes to a trailing 1 (`brand1`). Retry without it.
  if (!field && /#1(?:\.value)?\s*$/i.test(raw)) {
    field = LOOKUP.get(key.replace(/_?1$/, ""));
    if (field) return { field, canonical: normalizeHeader(field) === key.replace(/_?1$/, "") };
  }
  if (!field) return null;
  return { field, canonical: key === normalizeHeader(field) };
}

export interface HeaderRowScore {
  /** Distinct fields recognized in the row. */
  hits: number;
  /** How many of those are exact canonical field names. */
  canonical: number;
  /** Cells that are a canonical field name character for character, before normalizing. */
  literal: number;
}

export function scoreHeaderRow(cells: string[]): HeaderRowScore {
  const seen = new Map<FieldKey, boolean>();
  for (const cell of cells) {
    const m = matchHeader(String(cell ?? ""));
    if (!m) continue;
    seen.set(m.field, (seen.get(m.field) ?? false) || m.canonical);
  }
  let canonical = 0;
  for (const c of seen.values()) if (c) canonical += 1;
  let literal = 0;
  for (const cell of cells) if (LITERAL_FIELDS.has(String(cell ?? "").trim())) literal += 1;
  return { hits: seen.size, canonical, literal };
}

const HEADER_SCAN_ROWS = 10;
const LITERAL_FIELDS: ReadonlySet<string> = new Set(FIELDS);

/**
 * Index of the header row among the first 10 rows: the one recognizing the most
 * fields. Template files put a template-info row and a human-label row above the
 * field-name row, and both can match many aliases, so a tie goes to the row with
 * more exact field names, then to the row whose cells are literally field names
 * (a label row like "item sku" normalizes the same but isn't written that way),
 * then to the earliest row. Returns 0 when no row
 * recognizes at least two fields.
 */
export function detectHeaderRow(table: string[][]): number {
  let best = 0;
  let bestScore: HeaderRowScore = { hits: 0, canonical: 0, literal: 0 };
  const limit = Math.min(HEADER_SCAN_ROWS, table.length);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(table[i]);
    if (
      score.hits > bestScore.hits ||
      (score.hits === bestScore.hits && score.canonical > bestScore.canonical) ||
      (score.hits === bestScore.hits &&
        score.canonical === bestScore.canonical &&
        score.literal > bestScore.literal)
    ) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore.hits >= 2 ? best : 0;
}

/** Column index for each canonical field, or null when the file has no such column. */
export type Mapping = Record<FieldKey, number | null>;

export interface Detection {
  mapping: Mapping;
  /** True when the app can go straight to results without asking the user to confirm columns. */
  confident: boolean;
  /** Fields with more than one matching column. The first column was used. */
  ambiguous: FieldKey[];
  /** Non-blank headers that were not assigned to any field. */
  unmapped: string[];
}

export function detectMapping(headers: string[]): Detection {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping;
  const candidates = new Map<FieldKey, { index: number; canonical: boolean }[]>();
  headers.forEach((h, index) => {
    const m = matchHeader(String(h ?? ""));
    if (!m) return;
    const list = candidates.get(m.field) ?? [];
    list.push({ index, canonical: m.canonical });
    candidates.set(m.field, list);
  });

  const ambiguous: FieldKey[] = [];
  const used = new Set<number>();
  for (const field of FIELDS) {
    const list = candidates.get(field);
    if (!list || list.length === 0) continue;
    // A column named exactly like the field beats alias columns without raising a flag.
    const exact = list.filter((c) => c.canonical);
    const pool = exact.length > 0 ? exact : list;
    mapping[field] = pool[0].index;
    used.add(pool[0].index);
    if (pool.length > 1) ambiguous.push(field);
  }

  const unmapped: string[] = [];
  headers.forEach((h, index) => {
    const text = String(h ?? "").trim();
    if (text && !used.has(index)) unmapped.push(text);
  });

  const confident =
    mapping.item_sku !== null &&
    mapping.item_name !== null &&
    (mapping.parent_sku !== null || mapping.parent_child !== null) &&
    ambiguous.length === 0;

  return { mapping, confident, ambiguous, unmapped };
}
