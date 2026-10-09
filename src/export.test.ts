import { describe, expect, it } from "vitest";
import type { Issue } from "@relaywright/catalog-rules";
import Papa from "papaparse";
import { fixListCsv } from "./export.ts";

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: "missing-image:5:main_image_url",
    check: "basics",
    code: "missing-image",
    severity: "blocking",
    sku: "WB-1001-NVY-M",
    rowNumber: 5,
    field: "main_image_url",
    problem: "WB-1001-NVY-M has no main image URL.",
    suggestedFix: "Add a main image URL.",
    family: "WB-1001",
    related: [],
    ...over,
  };
}

/** Parses the export the way Excel would: BOM stripped, CRLF rows, quoted cells. */
function parse(csv: string): string[][] {
  return Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { skipEmptyLines: true }).data;
}

describe("fixListCsv", () => {
  it("starts with a UTF-8 BOM and the exact header", () => {
    const csv = fixListCsv([issue()]);
    expect(csv.startsWith("\uFEFFsku,row,severity,field,problem,suggested_fix\r\n")).toBe(true);
  });

  it("uses CRLF line endings throughout and ends with one", () => {
    const csv = fixListCsv([issue(), issue({ rowNumber: 6, sku: "WB-2" })]);
    const body = csv.replace(/^\uFEFF/, "");
    expect(body.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(body.endsWith("\r\n")).toBe(true);
    expect(body.split("\r\n")).toHaveLength(4);
  });

  it("writes only the header for an empty list", () => {
    expect(fixListCsv([])).toBe("\uFEFFsku,row,severity,field,problem,suggested_fix\r\n");
  });

  it("writes one plain row without unnecessary quotes", () => {
    const body = fixListCsv([issue()]).split("\r\n")[1];
    expect(body).toBe(
      "WB-1001-NVY-M,5,blocking,main_image_url,WB-1001-NVY-M has no main image URL.,Add a main image URL.",
    );
  });

  it("quotes cells with commas, double quotes, and line breaks, and round-trips them", () => {
    const tricky = issue({
      problem: 'Title "Marlow, the Wrap Dress"\nis too long.',
      suggestedFix: "Shorten it,\r\nthen re-upload.",
    });
    const csv = fixListCsv([tricky]);
    expect(csv).toContain('"Title ""Marlow, the Wrap Dress""\nis too long."');
    const rows = parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1][4]).toBe('Title "Marlow, the Wrap Dress"\nis too long.');
    expect(rows[1][5]).toBe("Shorten it,\r\nthen re-upload.");
  });

  it("writes a blank SKU as (row N)", () => {
    const rows = parse(
      fixListCsv([issue({ sku: "", rowNumber: 12, code: "missing-sku", field: "item_sku" })]),
    );
    expect(rows[1][0]).toBe("(row 12)");
    expect(rows[1][1]).toBe("12");
  });

  it.each([
    ['=HYPERLINK("http://example.com","x")', "'=HYPERLINK"],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
  ])("neutralizes a cell starting with a formula character: %j", (cell, expectedStart) => {
    const rows = parse(fixListCsv([issue({ problem: cell, suggestedFix: cell, sku: cell })]));
    expect(rows[1][0].startsWith(expectedStart)).toBe(true);
    expect(rows[1][4].startsWith(expectedStart)).toBe(true);
    expect(rows[1][5].startsWith(expectedStart)).toBe(true);
  });

  it("does not touch cells that merely contain a formula character later on", () => {
    const rows = parse(fixListCsv([issue({ problem: "Price is 5 - 3 = 2 @ list." })]));
    expect(rows[1][4]).toBe("Price is 5 - 3 = 2 @ list.");
  });

  it("neutralizes first, then quotes, so a formula with commas stays one safe cell", () => {
    const csv = fixListCsv([issue({ problem: "=SUM(1,2)" })]);
    expect(csv).toContain(`"'=SUM(1,2)"`);
  });

  it("keeps the issue order it was given", () => {
    const rows = parse(fixListCsv([issue({ rowNumber: 9, sku: "B" }), issue({ rowNumber: 2, sku: "A" })]));
    expect(rows.slice(1).map((r) => r[0])).toEqual(["B", "A"]);
  });

  it("contains no em dash for ordinary content", () => {
    expect(fixListCsv([issue()])).not.toContain(String.fromCharCode(0x2014));
  });
});
