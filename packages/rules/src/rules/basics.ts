import type { Check, Issue } from "../types.ts";
import { makeIssue } from "../catalog.ts";
import { get, parentage, parsePrice, who, capitalize } from "../normalize.ts";

export const checkBasics: Check = (catalog) => {
  const issues: Issue[] = [];

  for (const row of catalog.rows) {
    if (get(row, "item_sku") === "") {
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-sku",
          "item_sku",
          `Row ${row.rowNumber} has no item_sku.`,
          "Give this row a unique SKU.",
        ),
      );
    }

    if (parentage(row) === "parent") continue;

    if (get(row, "main_image_url") === "") {
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-image",
          "main_image_url",
          `${capitalize(who(row))} has no main image URL.`,
          "Add a link to the main product image in main_image_url.",
        ),
      );
    }

    const rawList = get(row, "standard_price");
    const list = parsePrice(rawList);
    if (list === null) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-price",
          "standard_price",
          rawList === ""
            ? `${capitalize(who(row))} has no standard_price.`
            : `${capitalize(who(row))} has a standard_price of "${rawList}", which isn't a number.`,
          "Enter the price as a number, such as 68.00.",
        ),
      );
    } else if (list <= 0) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "missing-price",
          "standard_price",
          `${capitalize(who(row))} has a standard_price of ${rawList}, which isn't above zero.`,
          "Enter the real selling price, such as 68.00.",
        ),
      );
    }

    const rawSale = get(row, "sale_price");
    const sale = parsePrice(rawSale);
    if (list !== null && sale !== null && sale > list) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "sale-above-list",
          "sale_price",
          `${capitalize(who(row))} has a sale_price of ${rawSale}, higher than its standard_price of ${rawList}.`,
          "Lower sale_price below standard_price, or clear it.",
        ),
      );
    }
  }

  return issues;
};
