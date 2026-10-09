import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTable } from "./table.ts";

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function utf8(text: string): ArrayBuffer {
  return toBuffer(new TextEncoder().encode(text));
}

const WIN1252: Record<string, number> = {
  è: 0xe8,
  é: 0xe9,
  "“": 0x93,
  "”": 0x94,
  "’": 0x92,
  "‘": 0x91,
  "€": 0x80,
  "–": 0x96,
};

function win1252(text: string): ArrayBuffer {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x80) out.push(code);
    else {
      const b = WIN1252[ch];
      if (b === undefined) throw new Error(`test helper cannot encode ${ch}`);
      out.push(b);
    }
  }
  return toBuffer(Uint8Array.from(out));
}

function xlsxBytes(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("readTable: CSV and TSV", () => {
  it("parses quoted commas, quotes, and line breaks inside cells", () => {
    const csv = 'sku,title,note\r\nWB-1,"Dress, long","She said ""hi""\nthen left"\r\nWB-2,Coat,\r\n';
    const { table } = readTable("catalog.csv", utf8(csv));
    expect(table).toEqual([
      ["sku", "title", "note"],
      ["WB-1", "Dress, long", 'She said "hi"\nthen left'],
      ["WB-2", "Coat", ""],
    ]);
  });

  it("auto-detects semicolon-delimited CSVs saved by European Excel", () => {
    const { table } = readTable("catalog.csv", utf8("sku;title\nWB-1;Dress\n"));
    expect(table).toEqual([
      ["sku", "title"],
      ["WB-1", "Dress"],
    ]);
  });

  it("reads .tsv files as tab-separated even when cells contain commas", () => {
    const { table } = readTable("catalog.TSV", utf8("sku\ttitle\nWB-1\tDress, long\n"));
    expect(table).toEqual([
      ["sku", "title"],
      ["WB-1", "Dress, long"],
    ]);
  });

  it("reads .txt files with an auto-detected delimiter", () => {
    const { table } = readTable("export.txt", utf8("sku\ttitle\nWB-1\tDress\n"));
    expect(table[0]).toEqual(["sku", "title"]);
  });

  it("strips a UTF-8 BOM so it never lands inside the first header", () => {
    const withBom = toBuffer(
      Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("sku,title\nWB-1,Dress\n")]),
    );
    const { table } = readTable("catalog.csv", withBom);
    expect(table[0]).toEqual(["sku", "title"]);
    expect(table[0][0].charCodeAt(0)).not.toBe(0xfeff);
  });

  it("decodes UTF-8 accents and curly quotes unchanged", () => {
    const { table } = readTable("catalog.csv", utf8("sku,title\nWB-1,“Crème” dress\n"));
    expect(table[1][1]).toBe("“Crème” dress");
  });

  it("falls back to Windows-1252 for Excel-saved CSVs and decodes accents and curly quotes", () => {
    const { table } = readTable("catalog.csv", win1252("sku,color_name,title\nWB-1,Crème,“Marlow” dress\n"));
    expect(table[1]).toEqual(["WB-1", "Crème", "“Marlow” dress"]);
  });

  it("decodes the whole Windows-1252 punctuation range, not just quotes", () => {
    const { table } = readTable("catalog.csv", win1252("sku,price\nWB-1,€68 – ‘sale’\n"));
    expect(table[1][1]).toBe("€68 – ‘sale’");
  });

  it("decodes UTF-16 text exports from Excel", () => {
    const text = "\uFEFFsku\ttitle\nWB-1\tCrème dress\n";
    const u16 = new Uint16Array([...text].map((c) => c.charCodeAt(0)));
    const { table } = readTable("export.txt", toBuffer(new Uint8Array(u16.buffer)));
    expect(table).toEqual([
      ["sku", "title"],
      ["WB-1", "Crème dress"],
    ]);
  });

  it("drops empty rows at the end only", () => {
    const { table } = readTable("catalog.csv", utf8("sku,title\nWB-1,Dress\n,\n\nWB-2,Coat\n\n,\n\n"));
    expect(table).toEqual([["sku", "title"], ["WB-1", "Dress"], ["", ""], [""], ["WB-2", "Coat"]]);
  });

  it("returns an empty table for an empty file", () => {
    expect(readTable("empty.csv", utf8("")).table).toEqual([]);
  });

  it("does not report a sheet name for text files", () => {
    expect(readTable("catalog.csv", utf8("sku,title\n")).sheetName).toBeUndefined();
  });
});

describe("readTable: spreadsheets", () => {
  it("picks the sheet whose header row looks like a catalog, not the first sheet", () => {
    const bytes = xlsxBytes({
      Instructions: [["Read me first"], ["This sheet has notes about the template."]],
      Template: [
        ["TemplateType=fptcustom", "Version=2024.0911"],
        ["Seller SKU", "Item Name"],
        ["item_sku", "item_name", "brand_name", "parent_child"],
        ["WB-1001", "Marlow Wrap Dress", "Westbrook & Co.", "parent"],
      ],
    });
    const { table, sheetName } = readTable("flat-file.xlsx", bytes);
    expect(sheetName).toBe("Template");
    expect(table[2]).toEqual(["item_sku", "item_name", "brand_name", "parent_child"]);
    expect(table[3]).toEqual(["WB-1001", "Marlow Wrap Dress", "Westbrook & Co.", "parent"]);
  });

  it("uses the first sheet when it is the best match", () => {
    const bytes = xlsxBytes({
      Catalog: [
        ["sku", "title"],
        ["WB-1", "Dress"],
      ],
      Other: [
        ["sku", "title"],
        ["WB-9", "Other"],
      ],
    });
    const { table, sheetName } = readTable("a.xlsx", bytes);
    expect(sheetName).toBe("Catalog");
    expect(table[1]).toEqual(["WB-1", "Dress"]);
  });

  it("turns every cell into a string, with blanks as empty strings", () => {
    const bytes = xlsxBytes({
      Sheet1: [
        ["sku", "title", "price", "sale"],
        ["WB-1", "Dress", 68, null],
      ],
    });
    const { table } = readTable("a.xlsx", bytes);
    expect(table[1]).toEqual(["WB-1", "Dress", "68", ""]);
  });

  it("keeps numeric UPCs as plain digits, not scientific notation", () => {
    const bytes = xlsxBytes({
      Sheet1: [
        ["sku", "upc"],
        ["WB-1", 400123456785],
        ["WB-2", 40012345678905],
      ],
    });
    const { table } = readTable("a.xlsx", bytes);
    expect(table[1][1]).toBe("400123456785");
    expect(table[2][1]).toBe("40012345678905");
  });

  it("reads .xlsm and .xls extensions through the same path", () => {
    const bytes = xlsxBytes({
      S: [
        ["sku", "title"],
        ["WB-1", "Dress"],
      ],
    });
    expect(readTable("a.xlsm", bytes).table[1]).toEqual(["WB-1", "Dress"]);
    expect(readTable("a.XLS", bytes).table[1]).toEqual(["WB-1", "Dress"]);
  });

  it("drops empty rows only at the end of a sheet", () => {
    const bytes = xlsxBytes({
      S: [
        ["sku", "title"],
        ["WB-1", "Dress"],
        [null, null],
        ["WB-2", "Coat"],
      ],
    });
    const { table } = readTable("a.xlsx", bytes);
    expect(table).toHaveLength(4);
    expect(table[3]).toEqual(["WB-2", "Coat"]);
  });
});

describe("readTable: unsupported files", () => {
  it("throws a plain sentence for other extensions", () => {
    expect(() => readTable("catalog.pdf", utf8("x"))).toThrow(
      "This file type isn't supported. Use CSV, TSV, or XLSX.",
    );
    expect(() => readTable("catalog", utf8("x"))).toThrow(
      "This file type isn't supported. Use CSV, TSV, or XLSX.",
    );
  });
});
