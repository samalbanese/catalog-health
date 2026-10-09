import type { Check, Issue, Row } from "../types.ts";
import { makeIssue } from "../catalog.ts";
import { DIM_FIELD, fieldDims, get, norm, parentage, skuLabel, themeDims, who } from "../normalize.ts";

/** The theme that decides which attributes a child must fill. */
function effectiveTheme(parent: Row | null, child: Row): string {
  const parentTheme = parent !== null ? get(parent, "variation_theme") : "";
  return parentTheme !== "" ? parentTheme : get(child, "variation_theme");
}

export const checkVariations: Check = (catalog) => {
  const issues: Issue[] = [];

  for (const family of catalog.families.values()) {
    if (family.kind === "orphans") {
      for (const row of family.children) {
        const p = get(row, "parent_sku");
        if (p === "") {
          issues.push(
            makeIssue(
              catalog,
              row,
              "orphan-child",
              "parent_sku",
              `Child ${who(row)} has no parent_sku, so it isn't attached to any variation family.`,
              "Fill in parent_sku with the parent's SKU, or change the row to a standalone product.",
            ),
          );
          continue;
        }
        const target = catalog.bySku.get(p);
        if (target === undefined) {
          issues.push(
            makeIssue(
              catalog,
              row,
              "orphan-child",
              "parent_sku",
              `Child ${who(row)} points to parent ${p}, which isn't in this file.`,
              "Add the parent row, or correct parent_sku.",
              [p],
            ),
          );
        } else {
          const kind = parentage(target) === "child" ? "child" : "standalone";
          issues.push(
            makeIssue(
              catalog,
              row,
              "orphan-child",
              "parent_sku",
              `Child ${who(row)} points to ${p} (row ${target.rowNumber}), which is a ${kind} row, not a parent.`,
              `Mark ${p} as a parent, or point parent_sku at the real parent.`,
              [p],
            ),
          );
        }
      }
    }

    const parentRow = family.parent;

    if (family.kind === "family" && parentRow !== null) {
      if (family.children.length === 0) {
        issues.push(
          makeIssue(
            catalog,
            parentRow,
            "childless-parent",
            "",
            `Parent ${who(parentRow)} has no child rows pointing at it.`,
            "Add the child rows, or remove this parent if the product has no variations.",
          ),
        );
      }

      const parentTheme = get(parentRow, "variation_theme");
      const parentDims = themeDims(parentTheme).join(",");
      for (const row of family.children) {
        const own = get(row, "variation_theme");
        // A parent with no theme is reported once on the parent (missing-required), not on every child.
        if (parentTheme !== "" && own !== "" && themeDims(own).join(",") !== parentDims) {
          const parentSays = `its parent uses "${parentTheme}"`;
          issues.push(
            makeIssue(
              catalog,
              row,
              "theme-mismatch",
              "variation_theme",
              `Child ${who(row)} uses the theme "${own}", but ${parentSays}.`,
              "Set the child's variation_theme to match the parent's, or leave it blank to inherit.",
              [skuLabel(parentRow)],
            ),
          );
        }
      }

      // Two children that differ in neither size nor color.
      const seen = new Map<string, Row>();
      for (const row of family.children) {
        const dims = fieldDims(effectiveTheme(parentRow, row));
        if (dims.length === 0) continue;
        const values = dims.map((d) => norm(get(row, DIM_FIELD[d])));
        if (values.some((v) => v === "")) continue;
        const key = `${dims.join("+")}:${values.join("|")}`;
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, row);
          continue;
        }
        const names = dims.map((d) => DIM_FIELD[d]).join(" and ");
        const shown = dims.map((d) => get(row, DIM_FIELD[d])).join(", ");
        issues.push(
          makeIssue(
            catalog,
            row,
            "duplicate-variant",
            "",
            `Child ${who(row)} has the same ${names} (${shown}) as ${skuLabel(first)} under parent ${skuLabel(parentRow)}.`,
            "Change the size or color on one of the two, or delete the extra child.",
            [skuLabel(first)],
          ),
        );
      }
    }

    if (family.kind !== "standalone") {
      for (const row of family.children) {
        const theme = effectiveTheme(parentRow, row);
        for (const dim of fieldDims(theme)) {
          const field = DIM_FIELD[dim];
          if (get(row, field) !== "") continue;
          issues.push(
            makeIssue(
              catalog,
              row,
              "missing-theme-attribute",
              field,
              `Child ${who(row)} has no ${field}, but its variation theme is "${theme}".`,
              `Fill in ${field} for this child, or change the variation theme.`,
            ),
          );
        }
      }
    }
  }

  return issues;
};
