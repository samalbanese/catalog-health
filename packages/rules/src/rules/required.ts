import type { Check, Issue } from "../types.ts";
import { makeIssue } from "../catalog.ts";
import { get, parentage, who, capitalize } from "../normalize.ts";

export const checkRequired: Check = (catalog, rules) => {
  const issues: Issue[] = [];

  // A Map, so a hostile product type like "constructor" can't reach Object.prototype.
  const types = new Map<string, string[]>();
  for (const [name, rule] of Object.entries(rules.productTypes)) {
    types.set(name.trim().toUpperCase(), rule.required);
  }
  const known = [...types.keys()];
  const knownList = known.length > 0 ? known.join(", ") : "none";

  for (const row of catalog.rows) {
    if (parentage(row) === "parent") {
      for (const key of rules.parentRequired) {
        if (get(row, key) !== "") continue;
        issues.push(
          makeIssue(
            catalog,
            row,
            "missing-required",
            key,
            `Parent ${who(row)} has no ${key}, which every parent row needs.`,
            `Fill in ${key} on the parent row.`,
          ),
        );
      }
      continue;
    }

    const type = get(row, "feed_product_type");
    if (type === "") {
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-required",
          "feed_product_type",
          `${capitalize(who(row))} has no feed_product_type, so its required fields can't be checked.`,
          `Fill in feed_product_type with one of: ${knownList}.`,
        ),
      );
      continue;
    }

    const required = types.get(type.toUpperCase());
    if (required === undefined) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "unknown-product-type",
          "feed_product_type",
          `${capitalize(who(row))} has feed_product_type "${type}", which isn't in the rules, so its required fields weren't checked.`,
          `Use one of ${knownList}, or add "${type.toUpperCase()}" to the rules.`,
        ),
      );
      continue;
    }

    for (const key of required) {
      if (get(row, key) !== "") continue;
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-required",
          key,
          `${capitalize(who(row))} has no ${key}, which ${type.toUpperCase()} products require.`,
          `Fill in ${key}.`,
        ),
      );
    }
  }

  return issues;
};
