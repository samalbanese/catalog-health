import type { Check, Issue, RuleSet } from "../types.ts";
import { makeIssue } from "../catalog.ts";
import { BULLET_KEYS, get, norm, parentage, plural, who, capitalize } from "../normalize.ts";

interface Phrase {
  text: string;
  lower: string;
  /** Null for symbol phrases, which match as plain substrings. */
  boundary: RegExp | null;
}

interface PhraseSet {
  phrases: Phrase[];
  /** One pattern for every word phrase, as a fast "does anything match" test. */
  anyWord: RegExp | null;
  symbols: string[];
}

const isWordChar = (c: string): boolean => /[A-Za-z0-9]/.test(c);
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compilePhrases(rules: RuleSet): PhraseSet {
  const phrases: Phrase[] = [];
  const wordBodies: string[] = [];
  const symbols: string[] = [];
  for (const raw of rules.content.bannedPhrases) {
    const text = raw.trim();
    if (text === "") continue;
    const lower = text.toLowerCase();
    let boundary: RegExp | null = null;
    if (isWordChar(text.charAt(0)) && isWordChar(text.charAt(text.length - 1))) {
      const body = lower.split(/\s+/).map(escapeRegex).join("\\s+");
      wordBodies.push(body);
      boundary = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i");
    } else {
      symbols.push(lower);
    }
    phrases.push({ text, lower, boundary });
  }
  const anyWord =
    wordBodies.length > 0 ? new RegExp(`(?<![a-z0-9])(?:${wordBodies.join("|")})(?![a-z0-9])`, "i") : null;
  return { phrases, anyWord, symbols };
}

/** The banned phrases found in a value, in rule order. */
function matchedPhrases(value: string, set: PhraseSet): string[] {
  if (value === "" || set.phrases.length === 0) return [];
  const lower = value.toLowerCase();
  let maybe = set.anyWord !== null && set.anyWord.test(lower);
  if (!maybe) {
    for (const sym of set.symbols) {
      if (lower.includes(sym)) {
        maybe = true;
        break;
      }
    }
  }
  if (!maybe) return [];
  const found: string[] = [];
  for (const p of set.phrases) {
    if (p.boundary === null ? lower.includes(p.lower) : p.boundary.test(lower)) found.push(p.text);
  }
  return found;
}

/** Words of four or more capital letters. */
const ALL_CAPS_WORD = /\b[A-Z]{4,}\b/g;

const quoteList = (items: string[]): string => items.map((i) => `"${i}"`).join(", ");

export const checkContent: Check = (catalog, rules) => {
  const issues: Issue[] = [];
  const c = rules.content;
  const phrases = compilePhrases(rules);
  const brandCache = new Map<string, { words: Set<string>; norm: string }>();
  const allowed = new Set(c.allCapsAllowed.map((w) => w.trim().toUpperCase()));

  const brandInfo = (brand: string): { words: Set<string>; norm: string } => {
    let info = brandCache.get(brand);
    if (info === undefined) {
      info = {
        words: new Set(
          brand
            .toUpperCase()
            .split(/[^A-Z]+/)
            .filter((w) => w !== ""),
        ),
        norm: norm(brand),
      };
      brandCache.set(brand, info);
    }
    return info;
  };
  const startsWithBrand = (title: string, brand: string): boolean =>
    title.slice(0, brand.length).toLowerCase() === brand.toLowerCase() ||
    norm(title).startsWith(brandInfo(brand).norm);

  for (const row of catalog.rows) {
    const isParent = parentage(row) === "parent";
    const title = get(row, "item_name");
    const brand = get(row, "brand_name");

    if (title.length > c.titleMaxLength) {
      const over = title.length - c.titleMaxLength;
      issues.push(
        makeIssue(
          catalog,
          row,
          "title-too-long",
          "item_name",
          `The title on ${who(row)} is ${plural(title.length, "character")}, over the ${c.titleMaxLength} limit.`,
          `Shorten item_name by at least ${plural(over, "character")}.`,
        ),
      );
    }

    const inTitle = matchedPhrases(title, phrases);
    if (inTitle.length > 0) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "banned-phrase",
          "item_name",
          `The title on ${who(row)} contains ${quoteList(inTitle)}.`,
          "Remove the promotional wording from item_name.",
        ),
      );
    }

    if (title !== "") {
      const shouting = title.match(ALL_CAPS_WORD);
      const words =
        shouting === null
          ? []
          : [...new Set(shouting)].filter((w) => !allowed.has(w) && !brandInfo(brand).words.has(w));
      if (words.length > 0) {
        issues.push(
          makeIssue(
            catalog,
            row,
            "all-caps-word",
            "item_name",
            `The title on ${who(row)} has all-caps ${words.length === 1 ? "word" : "words"}: ${words.join(", ")}.`,
            "Write them in normal capitalization. Acronyms can be added to the allowed list in the rules.",
          ),
        );
      }
    }

    if (brand !== "" && title !== "" && !startsWithBrand(title, brand)) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "title-brand-prefix",
          "item_name",
          `The title on ${who(row)} doesn't start with the brand "${brand}".`,
          "Start item_name with the brand name.",
        ),
      );
    }

    if (isParent) continue;

    let filled = 0;
    for (const key of BULLET_KEYS) {
      const bullet = get(row, key);
      if (bullet === "") continue;
      filled++;

      const found = matchedPhrases(bullet, phrases);
      if (found.length > 0) {
        issues.push(
          makeIssue(
            catalog,
            row,
            "banned-phrase",
            key,
            `${bulletName(key)} on ${who(row)} contains ${quoteList(found)}.`,
            `Remove the promotional wording from ${key}.`,
          ),
        );
      }

      if (bullet.length > c.bulletMaxLength) {
        issues.push(
          makeIssue(
            catalog,
            row,
            "bullet-too-long",
            key,
            `${bulletName(key)} on ${who(row)} is ${plural(bullet.length, "character")}, over the ${c.bulletMaxLength} limit.`,
            `Shorten ${key} by at least ${plural(bullet.length - c.bulletMaxLength, "character")}.`,
          ),
        );
      }
    }

    if (filled < c.minBullets) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "bullet-count",
          "",
          `${capitalize(who(row))} has ${plural(filled, "bullet point")}, fewer than the minimum of ${c.minBullets}.`,
          `Add at least ${plural(c.minBullets - filled, "more bullet point")}.`,
        ),
      );
    } else if (filled > c.maxBullets) {
      issues.push(
        makeIssue(
          catalog,
          row,
          "bullet-count",
          "",
          `${capitalize(who(row))} has ${plural(filled, "bullet point")}, more than the maximum of ${c.maxBullets}.`,
          `Remove ${plural(filled - c.maxBullets, "bullet point")}.`,
        ),
      );
    }
  }

  return issues;
};

function bulletName(key: string): string {
  return `Bullet ${key.replace("bullet_point", "")}`;
}
