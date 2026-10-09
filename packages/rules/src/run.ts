import type { CheckId, Issue, ProductTypeRule, Report, Row, RuleSet, Severity } from "./types.ts";
import { CHECKS, SEVERITIES } from "./types.ts";
import rulesJson from "./example-rules.json" with { type: "json" };
import { buildCatalog } from "./catalog.ts";
import { score } from "./score.ts";
import { checkVariations } from "./rules/variations.ts";
import { checkRequired } from "./rules/required.ts";
import { checkDuplicates } from "./rules/duplicates.ts";
import { checkContent } from "./rules/content.ts";
import { checkBasics } from "./rules/basics.ts";

/** The example rules the app starts with. They are an example, not a marketplace's official template. */
export const exampleRules: RuleSet = rulesJson;

const SEVERITY_RANK: Record<Severity, number> = { blocking: 0, warning: 1, tidy: 2 };

/** Run every check over canonical rows and build the report. */
export function runChecks(rows: Row[], rules: RuleSet): Report {
  const catalog = buildCatalog(rows);

  const all: Issue[] = [
    ...checkVariations(catalog, rules),
    ...checkRequired(catalog, rules),
    ...checkDuplicates(catalog, rules),
    ...checkContent(catalog, rules),
    ...checkBasics(catalog, rules),
  ];

  // A missing size or color is reported once, by the more specific message.
  const themeMisses = new Set<string>();
  for (const i of all) if (i.code === "missing-theme-attribute") themeMisses.add(`${i.rowNumber}:${i.field}`);

  const seen = new Set<string>();
  const issues = all.filter((i) => {
    if (i.code === "missing-required" && themeMisses.has(`${i.rowNumber}:${i.field}`)) return false;
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  issues.sort(
    (a, b) =>
      a.rowNumber - b.rowNumber ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );

  const counts: Record<Severity, number> = { blocking: 0, warning: 0, tidy: 0 };
  const byCheck = Object.fromEntries(CHECKS.map((c) => [c, 0])) as Record<CheckId, number>;
  const worst = new Map<number, number>();
  for (const i of issues) {
    counts[i.severity]++;
    byCheck[i.check]++;
    const rank = SEVERITY_RANK[i.severity];
    const prev = worst.get(i.rowNumber);
    if (prev === undefined || rank < prev) worst.set(i.rowNumber, rank);
  }
  const rowsAffected: Record<Severity, number> = { blocking: 0, warning: 0, tidy: 0 };
  for (const rank of worst.values()) rowsAffected[SEVERITIES[rank]]++;

  return {
    rowCount: rows.length,
    issues,
    score: score(rowsAffected, rows.length),
    counts,
    byCheck,
    families: [...catalog.families.values()],
    rowsAffected,
  };
}

// ---------------------------------------------------------------------------
// Rules validation, for the in-app rules editor.

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_ITEMS = 500;
const MAX_TEXT = 300;

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be a list of text values, like ["item_name", "brand_name"].`);
    return [];
  }
  if (value.length > MAX_ITEMS) {
    errors.push(`${path} has more than ${MAX_ITEMS} entries.`);
    return [];
  }
  const out: string[] = [];
  value.forEach((v, n) => {
    if (typeof v !== "string") {
      errors.push(`${path} entry ${n + 1} must be text.`);
    } else if (v.length > MAX_TEXT) {
      errors.push(`${path} entry ${n + 1} is longer than ${MAX_TEXT} characters.`);
    } else {
      out.push(v);
    }
  });
  return out;
}

function wholeNumber(value: unknown, path: string, min: number, errors: string[]): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    errors.push(`${path} must be a whole number of ${min} or more.`);
    return min;
  }
  return value;
}

/** Check that a value has the shape of a RuleSet. Returns a fresh copy, or plain-language errors. */
export function validateRuleSet(
  value: unknown,
): { ok: true; rules: RuleSet } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ["The rules must be a JSON object, like { ... }."] };

  const label = value.label;
  if (typeof label !== "string") errors.push('"label" must be text.');

  const productTypes: Record<string, ProductTypeRule> = {};
  if (!isObject(value.productTypes)) {
    errors.push(
      '"productTypes" must be an object with one entry per product type, like { "DRESS": { "required": [...] } }.',
    );
  } else {
    const names = Object.keys(value.productTypes);
    if (names.length > MAX_ITEMS) errors.push(`"productTypes" has more than ${MAX_ITEMS} entries.`);
    for (const name of names.slice(0, MAX_ITEMS)) {
      const key = name.trim().toUpperCase();
      if (UNSAFE_KEYS.has(name) || UNSAFE_KEYS.has(name.toLowerCase())) {
        errors.push(`"${name}" can't be used as a product type name.`);
        continue;
      }
      if (key === "") {
        errors.push("A product type name can't be blank.");
        continue;
      }
      if (Object.hasOwn(productTypes, key)) {
        errors.push(`The product type ${key} is listed twice.`);
        continue;
      }
      const entry = value.productTypes[name];
      if (!isObject(entry)) {
        errors.push(`productTypes.${name} must be an object with a "required" list.`);
        continue;
      }
      productTypes[key] = { required: stringList(entry.required, `productTypes.${name}.required`, errors) };
    }
  }

  const parentRequired = stringList(value.parentRequired, "parentRequired", errors);

  const content: RuleSet["content"] = {
    titleMaxLength: 150,
    bannedPhrases: [],
    minBullets: 0,
    maxBullets: 5,
    bulletMaxLength: 255,
    allCapsAllowed: [],
  };
  if (!isObject(value.content)) {
    errors.push('"content" must be an object with the title and bullet limits.');
  } else {
    const c = value.content;
    content.titleMaxLength = wholeNumber(c.titleMaxLength, "content.titleMaxLength", 1, errors);
    content.bannedPhrases = stringList(c.bannedPhrases, "content.bannedPhrases", errors);
    content.minBullets = wholeNumber(c.minBullets, "content.minBullets", 0, errors);
    content.maxBullets = wholeNumber(c.maxBullets, "content.maxBullets", 0, errors);
    content.bulletMaxLength = wholeNumber(c.bulletMaxLength, "content.bulletMaxLength", 1, errors);
    content.allCapsAllowed = stringList(c.allCapsAllowed, "content.allCapsAllowed", errors);
    if (content.minBullets > content.maxBullets) {
      errors.push("content.minBullets can't be higher than content.maxBullets.");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    rules: { label: label as string, productTypes, parentRequired, content },
  };
}
