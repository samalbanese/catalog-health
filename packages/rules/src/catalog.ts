import type { Catalog, CheckId, Family, Issue, IssueCode, Row, Severity } from "./types.ts";
import { get, parentage, skuLabel } from "./normalize.ts";

/**
 * The single source of truth for each issue code: which check owns it, how
 * severe it is, and the sentence the "How it checks" panel shows.
 */
export const CHECK_DESCRIPTIONS: Record<IssueCode, { check: CheckId; severity: Severity; summary: string }> =
  {
    "orphan-child": {
      check: "variations",
      severity: "blocking",
      summary:
        "A child row has no parent_sku, or its parent_sku points to a SKU that isn't in the file or isn't marked as a parent.",
    },
    "childless-parent": {
      check: "variations",
      severity: "warning",
      summary: "A parent row has no child rows pointing at it.",
    },
    "theme-mismatch": {
      check: "variations",
      severity: "blocking",
      summary: "A child's variation_theme varies on different attributes than its parent's theme does.",
    },
    "missing-theme-attribute": {
      check: "variations",
      severity: "blocking",
      summary:
        "A child is missing the size_name or color_name that its family's variation theme says it varies on.",
    },
    "duplicate-variant": {
      check: "variations",
      severity: "blocking",
      summary: "Two children in the same family have the same size and color values.",
    },
    "missing-required": {
      check: "required",
      severity: "blocking",
      summary:
        "A row leaves blank a field the rules require: parent rows need the parent fields, and other rows need the fields for their product type.",
    },
    "unknown-product-type": {
      check: "required",
      severity: "warning",
      summary:
        "A row's feed_product_type isn't one of the product types in the rules, so its required fields can't be checked.",
    },
    "duplicate-sku": {
      check: "duplicates",
      severity: "blocking",
      summary: "The same SKU appears on more than one row.",
    },
    "duplicate-external-id": {
      check: "duplicates",
      severity: "blocking",
      summary:
        "Two sellable rows share the same barcode (UPC, EAN, or GTIN), ignoring spaces and leading zeros.",
    },
    "duplicate-style": {
      check: "duplicates",
      severity: "warning",
      summary: "The same style number is used by two or more different families.",
    },
    "near-duplicate-title": {
      check: "duplicates",
      severity: "warning",
      summary:
        "Two different families have the same brand, color, and title words once the size is removed, so they may be the same product listed twice.",
    },
    "title-too-long": {
      check: "content",
      severity: "warning",
      summary: "A title is longer than the maximum title length in the rules.",
    },
    "banned-phrase": {
      check: "content",
      severity: "warning",
      summary: "A title or bullet point contains a promotional phrase from the banned list.",
    },
    "all-caps-word": {
      check: "content",
      severity: "tidy",
      summary:
        "A title has a word of four or more capital letters that isn't an allowed acronym or part of the brand name.",
    },
    "title-brand-prefix": {
      check: "content",
      severity: "tidy",
      summary: "A title doesn't start with the brand name.",
    },
    "bullet-count": {
      check: "content",
      severity: "tidy",
      summary: "A row has fewer bullet points than the minimum, or more than the maximum, in the rules.",
    },
    "bullet-too-long": {
      check: "content",
      severity: "tidy",
      summary: "A bullet point is longer than the maximum bullet length in the rules.",
    },
    "missing-sku": {
      check: "basics",
      severity: "blocking",
      summary: "A row has no item_sku.",
    },
    "missing-image": {
      check: "basics",
      severity: "blocking",
      summary: "A sellable row has no main image URL.",
    },
    "missing-price": {
      check: "basics",
      severity: "blocking",
      summary: "A sellable row has a blank, zero, or unreadable standard price.",
    },
    "sale-above-list": {
      check: "basics",
      severity: "warning",
      summary: "A row's sale price is higher than its standard price.",
    },
  };

/** Build one Issue; check and severity come from CHECK_DESCRIPTIONS. */
export function makeIssue(
  catalog: Catalog,
  row: Row,
  code: IssueCode,
  field: string,
  problem: string,
  suggestedFix: string,
  related: string[] = [],
): Issue {
  const d = CHECK_DESCRIPTIONS[code];
  return {
    id: `${code}:${row.rowNumber}:${field}`,
    check: d.check,
    code,
    severity: d.severity,
    sku: get(row, "item_sku"),
    rowNumber: row.rowNumber,
    field,
    problem,
    suggestedFix,
    family: catalog.familyOf.get(row.rowNumber) ?? "",
    related,
  };
}

/** Group rows into variation families. See the shared rule semantics in the plan. */
export function buildCatalog(rows: Row[]): Catalog {
  const bySku = new Map<string, Row>();
  for (const row of rows) {
    const sku = get(row, "item_sku");
    if (sku !== "" && !bySku.has(sku)) bySku.set(sku, row);
  }

  const families = new Map<string, Family>();
  const familyOf = new Map<number, string>();
  // Children whose parent is valid are attached after the pass, so a child
  // listed above its parent still lands in the right family.
  const attach: { row: Row; key: string }[] = [];

  for (const row of rows) {
    const sku = get(row, "item_sku");
    const kind = parentage(row);

    if (kind === "parent" && sku !== "" && bySku.get(sku) === row) {
      families.set(sku, { key: sku, kind: "family", parent: row, children: [] });
      familyOf.set(row.rowNumber, sku);
      continue;
    }

    if (kind === "child") {
      const p = get(row, "parent_sku");
      const target = p !== "" ? bySku.get(p) : undefined;
      if (target !== undefined && p !== "" && parentage(target) === "parent") {
        attach.push({ row, key: p });
        continue;
      }
      let key = p !== "" ? p : `orphan:${skuLabel(row)}`;
      const taken = families.get(key);
      if (taken !== undefined && taken.kind !== "orphans") key = `orphan:${key}`;
      let family = families.get(key);
      if (family === undefined) {
        family = { key, kind: "orphans", parent: null, children: [] };
        families.set(key, family);
      }
      family.children.push(row);
      familyOf.set(row.rowNumber, key);
      continue;
    }

    const key = sku !== "" && !families.has(sku) ? sku : `row:${row.rowNumber}`;
    families.set(key, { key, kind: "standalone", parent: null, children: [row] });
    familyOf.set(row.rowNumber, key);
  }

  for (const { row, key } of attach) {
    families.get(key)?.children.push(row);
    familyOf.set(row.rowNumber, key);
  }

  return { rows, bySku, familyOf, families };
}

/** The row that stands for a family: its parent, or else its first row. */
export function headRow(family: Family): Row | null {
  return family.parent ?? family.children[0] ?? null;
}
