// Shared contract for the catalog rules engine. Framework-free: no DOM, no React,
// so the app's Web Worker, Node scripts, and later tools can all run it.

/** Canonical column keys, named after the common marketplace flat-file fields. */
export const FIELDS = [
  "item_sku",
  "parent_sku",
  "parent_child",
  "variation_theme",
  "feed_product_type",
  "item_name",
  "brand_name",
  "external_product_id",
  "style_number",
  "size_name",
  "color_name",
  "department_name",
  "material_type",
  "bullet_point1",
  "bullet_point2",
  "bullet_point3",
  "bullet_point4",
  "bullet_point5",
  "main_image_url",
  "standard_price",
  "sale_price",
] as const;
export type FieldKey = (typeof FIELDS)[number];

/**
 * One product row after header mapping. `fields` holds every column: mapped
 * columns under their canonical key, unmapped columns under their header
 * lowercased with spaces turned into underscores. Values are trimmed strings;
 * a missing cell is "".
 */
export interface Row {
  /** Line number in the source file (the header row is not data; first data row of a one-header file is 2). */
  rowNumber: number;
  fields: Record<string, string>;
}

export type Severity = "blocking" | "warning" | "tidy";
export const SEVERITIES: readonly Severity[] = ["blocking", "warning", "tidy"];

export type CheckId = "variations" | "required" | "duplicates" | "content" | "basics";
export const CHECKS: readonly CheckId[] = ["variations", "required", "duplicates", "content", "basics"];

export type IssueCode =
  // variations
  | "orphan-child"
  | "childless-parent"
  | "theme-mismatch"
  | "duplicate-variant"
  | "missing-theme-attribute"
  // required
  | "missing-required"
  | "unknown-product-type"
  // duplicates
  | "duplicate-sku"
  | "duplicate-external-id"
  | "duplicate-style"
  | "near-duplicate-title"
  // content
  | "title-too-long"
  | "banned-phrase"
  | "all-caps-word"
  | "title-brand-prefix"
  | "bullet-count"
  | "bullet-too-long"
  // basics
  | "missing-sku"
  | "missing-image"
  | "missing-price"
  | "sale-above-list";

export interface Issue {
  /** Stable id: `${code}:${rowNumber}:${field}` (field may be ""). Unique within a report. */
  id: string;
  check: CheckId;
  code: IssueCode;
  severity: Severity;
  sku: string;
  rowNumber: number;
  /** Canonical key (or unmapped column key) the problem is about; "" when it is about the whole row. */
  field: string;
  /** One plain-language sentence a catalog person understands, naming the values involved. */
  problem: string;
  /** One plain-language sentence saying what to change. */
  suggestedFix: string;
  /** Family key, see `Family.key`. */
  family: string;
  /** Other SKUs involved (the other half of a duplicate, the parent, etc.). */
  related: string[];
}

export interface ProductTypeRule {
  /** Field keys every non-parent row of this product type must fill. */
  required: string[];
}

export interface RuleSet {
  /** Shown in the UI so nobody mistakes the example for a marketplace's official template. */
  label: string;
  /** Keyed by feed_product_type, uppercase (e.g. "DRESS"). */
  productTypes: Record<string, ProductTypeRule>;
  /** Field keys every parent row must fill, whatever its product type. */
  parentRequired: string[];
  content: {
    titleMaxLength: number;
    /** Case-insensitive substrings; "!" matches a literal exclamation mark. */
    bannedPhrases: string[];
    minBullets: number;
    maxBullets: number;
    bulletMaxLength: number;
    /** Words of 4+ letters in all caps are flagged unless listed here (compared uppercase). */
    allCapsAllowed: string[];
  };
}

/** A variation family: a parent and its children, or a standalone row on its own. */
export interface Family {
  /**
   * The parent's SKU. For orphans, the parent_sku value they point to (may be ""
   * when blank, in which case the key is `orphan:${childSku}`). For a standalone
   * row, its own SKU.
   */
  key: string;
  kind: "family" | "orphans" | "standalone";
  parent: Row | null;
  children: Row[];
}

export interface Report {
  rowCount: number;
  issues: Issue[];
  /** 0 to 100, see `score()` in score.ts for the formula shown to users. */
  score: number;
  counts: Record<Severity, number>;
  byCheck: Record<CheckId, number>;
  families: Family[];
  /** Rows with at least one issue, by severity of their worst issue. */
  rowsAffected: Record<Severity, number>;
}

/** Built once per run and handed to every check. */
export interface Catalog {
  rows: Row[];
  /** First row for each non-blank SKU. Later rows with the same SKU are reported as duplicate-sku. */
  bySku: Map<string, Row>;
  /** Family key for each row, by rowNumber (unique even when SKUs are blank or repeated). */
  familyOf: Map<number, string>;
  families: Map<string, Family>;
}

export type Check = (catalog: Catalog, rules: RuleSet) => Issue[];
