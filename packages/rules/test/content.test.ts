import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.ts";
import { checkContent } from "../src/rules/content.ts";
import { child, clean, exampleRules, parent } from "./fixtures.ts";
import type { IssueCode, Row } from "../src/types.ts";

const run = (rows: Row[], code?: IssueCode) =>
  checkContent(buildCatalog(rows), exampleRules).filter((i) => code === undefined || i.code === code);

describe("content: clean twin", () => {
  it("is silent on clean rows", () => {
    expect(run([clean(2, "S1"), parent(3, "P1"), child(4, "C1", "P1")])).toEqual([]);
  });
});

describe("title-too-long", () => {
  it("fires over the limit and not at it", () => {
    const prefix = "Westbrook & Co. ";
    const at = prefix + "x".repeat(150 - prefix.length);
    expect(run([clean(2, "S1", { item_name: at })], "title-too-long")).toEqual([]);
    const issues = run([clean(2, "S1", { item_name: at + "y" })], "title-too-long");
    expect(issues.map((i) => i.id)).toEqual(["title-too-long:2:item_name"]);
    expect(issues[0].problem).toContain("151");
    expect(issues[0].problem).toContain("150");
    expect(issues[0].severity).toBe("warning");
  });
  it("applies to parent rows too", () => {
    const long = "Westbrook & Co. " + "x".repeat(150);
    expect(run([parent(2, "P1", { item_name: long })], "title-too-long").length).toBe(1);
  });
});

describe("banned-phrase", () => {
  it("lists every phrase found in a title, as one issue", () => {
    const issues = run(
      [clean(2, "S1", { item_name: "Westbrook & Co. Wrap Dress, Best Seller, free shipping!" })],
      "banned-phrase",
    );
    expect(issues.length).toBe(1);
    expect(issues[0].field).toBe("item_name");
    expect(issues[0].problem).toContain('"best seller"');
    expect(issues[0].problem).toContain('"free shipping"');
    expect(issues[0].problem).toContain('"!"');
    expect(issues[0].severity).toBe("warning");
  });
  it("matches letter phrases on word boundaries only", () => {
    expect(run([clean(2, "S1", { item_name: "Westbrook & Co. Wholesale Dress" })], "banned-phrase")).toEqual(
      [],
    );
    expect(
      run([clean(2, "S1", { item_name: "Westbrook & Co. Dress on SALE" })], "banned-phrase").length,
    ).toBe(1);
  });
  it("matches symbol phrases as plain substrings", () => {
    expect(
      run([clean(2, "S1", { item_name: "Westbrook & Co. Dress #1 Pick" })], "banned-phrase").length,
    ).toBe(1);
  });
  it("checks bullets on non-parent rows, one issue per bullet field", () => {
    const issues = run(
      [clean(2, "S1", { bullet_point2: "Hot deal today", bullet_point4: "Limited time only" })],
      "banned-phrase",
    );
    expect(issues.map((i) => i.id)).toEqual([
      "banned-phrase:2:bullet_point2",
      "banned-phrase:2:bullet_point4",
    ]);
  });
  it("does not check bullets on a parent row", () => {
    expect(run([parent(2, "P1", { bullet_point1: "Free shipping!" })], "banned-phrase")).toEqual([]);
  });
  it("treats regex characters in a phrase as plain text", () => {
    const rules = { ...exampleRules, content: { ...exampleRules.content, bannedPhrases: ["a+b", "(x"] } };
    const rows = [clean(2, "S1", { item_name: "Westbrook & Co. a+b (x Dress" })];
    expect(checkContent(buildCatalog(rows), rules).length).toBe(1);
  });
});

describe("all-caps-word", () => {
  it("lists unapproved all-caps words, one issue per row", () => {
    const issues = run(
      [clean(2, "S1", { item_name: "Westbrook & Co. BREATHABLE Wrap Dress WRINKLE Free" })],
      "all-caps-word",
    );
    expect(issues.length).toBe(1);
    expect(issues[0].problem).toContain("BREATHABLE");
    expect(issues[0].problem).toContain("WRINKLE");
    expect(issues[0].severity).toBe("tidy");
  });
  it("allows listed words, short words, and the brand's own words", () => {
    const listed = clean(2, "S1", { item_name: "Westbrook & Co. USA Made UPF Dress XXL OK" });
    expect(run([listed], "all-caps-word")).toEqual([]);
    const brand = clean(3, "S2", { brand_name: "ACME", item_name: "ACME Wrap Dress" });
    expect(run([brand], "all-caps-word")).toEqual([]);
  });
});

describe("title-brand-prefix", () => {
  it("fires when the title does not start with the brand", () => {
    const issues = run(
      [clean(2, "S1", { item_name: "Marlow Wrap Dress by Westbrook & Co." })],
      "title-brand-prefix",
    );
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe("tidy");
    expect(issues[0].problem).toContain("Westbrook & Co.");
  });
  it("is case-insensitive and skips rows with no brand or no title", () => {
    expect(run([clean(2, "S1", { item_name: "WESTBROOK & CO. Wrap Dress" })], "title-brand-prefix")).toEqual(
      [],
    );
    expect(run([clean(2, "S1", { brand_name: "" })], "title-brand-prefix")).toEqual([]);
    expect(run([clean(2, "S1", { item_name: "" })], "title-brand-prefix")).toEqual([]);
  });
});

describe("bullet-count", () => {
  it("fires with fewer than the minimum", () => {
    const issues = run(
      [clean(2, "S1", { bullet_point3: "", bullet_point4: "", bullet_point5: "" })],
      "bullet-count",
    );
    expect(issues.length).toBe(1);
    expect(issues[0].field).toBe("");
    expect(issues[0].id).toBe("bullet-count:2:");
    expect(issues[0].problem).toContain("2");
    expect(issues[0].severity).toBe("tidy");
  });
  it("fires with more than the maximum when the rules allow fewer", () => {
    const rules = { ...exampleRules, content: { ...exampleRules.content, maxBullets: 4 } };
    const issues = checkContent(buildCatalog([clean(2, "S1")]), rules);
    expect(issues.filter((i) => i.code === "bullet-count").length).toBe(1);
  });
  it("skips parent rows", () => {
    expect(run([parent(2, "P1")], "bullet-count")).toEqual([]);
  });
});

describe("bullet-too-long", () => {
  it("fires per long bullet", () => {
    const issues = run(
      [clean(2, "S1", { bullet_point2: "x".repeat(256), bullet_point5: "y".repeat(300) })],
      "bullet-too-long",
    );
    expect(issues.map((i) => i.id)).toEqual([
      "bullet-too-long:2:bullet_point2",
      "bullet-too-long:2:bullet_point5",
    ]);
    expect(issues[0].severity).toBe("tidy");
    expect(run([clean(2, "S1", { bullet_point2: "x".repeat(255) })], "bullet-too-long")).toEqual([]);
  });
});
