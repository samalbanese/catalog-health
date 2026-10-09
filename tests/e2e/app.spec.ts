import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as XLSX from "xlsx";
import { CHECK_DESCRIPTIONS, type IssueCode, type Severity } from "../../packages/rules/src/index.ts";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const SAMPLE_CSV = readFileSync(root("samples/westbrook-catalog.csv"), "utf8");
const ANSWER_KEY: { code: IssueCode; sku: string; field: string }[] = JSON.parse(
  readFileSync(root("samples/answer-key.json"), "utf8"),
);
const expected: Record<Severity, number> = { blocking: 0, warning: 0, tidy: 0 };
for (const a of ANSWER_KEY) expected[CHECK_DESCRIPTIONS[a.code].severity]++;
const total = ANSWER_KEY.length;

async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample catalog" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /problems across/ })).toBeVisible();
}

async function expectCounts(page: Page) {
  for (const s of ["blocking", "warning", "tidy"] as const) {
    await expect(page.getByTestId(`count-${s}`)).toContainText(String(expected[s]));
  }
}

test("the sample catalog surfaces every planted problem", async ({ page }) => {
  await loadSample(page);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^${total} problems`) })).toBeVisible();
  await expectCounts(page);
  await expect(page.getByLabel(/Catalog health \d+ out of 100/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Every row of the file in order/ })).toBeVisible();
});

test("uploading the sample as CSV gives the same result", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "my-catalog.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(SAMPLE_CSV),
  });
  await expect(page.getByText("my-catalog.csv").first()).toBeVisible();
  await expectCounts(page);
});

test("an XLSX with a cover sheet and a three-row template header is read correctly", async ({ page }) => {
  const rows = XLSX.read(SAMPLE_CSV, { type: "string", raw: true });
  const data = XLSX.utils.sheet_to_json<string[]>(rows.Sheets[rows.SheetNames[0]!]!, {
    header: 1,
    raw: false,
    defval: "",
  });
  const header = data[0]!;
  const template = [
    ["TemplateType=fptcustom", "Version=2026.1"],
    header.map((h) => h.replace(/_/g, " ")),
    ...data,
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["Instructions"], ["Fill in the Template tab."]]),
    "Instructions",
  );
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(template), "Template");
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "flat-file.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expectCounts(page);
});

test("unclear column names open the matching step", async ({ page }) => {
  const [head, ...rest] = SAMPLE_CSV.split("\n");
  const renamed = [
    head!.replace("item_sku", "Product Code").replace("item_name", "Listing Name"),
    ...rest,
  ].join("\n");
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "renamed.csv", mimeType: "text/csv", buffer: Buffer.from(renamed) });
  await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible();
  const run = page.getByRole("button", { name: "Run the check" });
  await expect(run).toBeDisabled();
  await page.getByLabel(/^SKU/).selectOption({ label: "Product Code" });
  await page.getByLabel(/^Title/).selectOption({ label: "Listing Name" });
  await run.click();
  await expectCounts(page);
});

test("filters narrow the list and the export", async ({ page }) => {
  await loadSample(page);
  const exportButton = page.getByRole("button", { name: /Export fix list/ });
  await expect(exportButton).toContainText(`${total} issues`);
  await page.getByRole("checkbox", { name: /^Blocking/ }).uncheck();
  await expect(exportButton).toContainText(`${total - expected.blocking} issues`);
  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(exportButton).toContainText(`${total} issues`);
});

test("a family opens and closes from the keyboard", async ({ page }) => {
  await loadSample(page);
  const first = page.locator(".family h3 button").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".fam-panel table")).toBeVisible();
  await expect(page.locator(".issue").first()).toContainText("Fix");
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(first).toBeFocused();
});

test("the fix list downloads as a CSV with one line per issue", async ({ page }) => {
  await loadSample(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export fix list/ }).click();
  const file = await (await download).path();
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const parsed = XLSX.read(text, { type: "string", raw: true });
  const lines = XLSX.utils.sheet_to_json<string[]>(parsed.Sheets[parsed.SheetNames[0]!]!, { header: 1 });
  expect(lines[0]).toEqual(["sku", "row", "severity", "field", "problem", "suggested_fix"]);
  expect(lines.length - 1).toBe(total);
});

test("the rules editor rejects bad JSON and applies good edits", async ({ page }) => {
  await loadSample(page);
  await page.getByText("Edit the rules").click();
  const editor = page.getByLabel("Rules as JSON");
  const original = await editor.inputValue();
  await editor.fill("{ not json");
  await page.getByRole("button", { name: "Apply rules" }).click();
  await expect(page.getByRole("alert")).toContainText("valid JSON");

  await editor.fill(original.replace(/"titleMaxLength": \d+/, '"titleMaxLength": 40'));
  await page.getByRole("button", { name: "Apply rules" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`problems across`) })).not.toHaveText(
    new RegExp(`^${total} problems`),
  );
  await page.getByRole("button", { name: "Reset to example rules" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^${total} problems`) })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`no accessibility violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Try the sample catalog" }).click();
    await page.locator(".family h3 button").first().click();
    await page.getByText("Edit the rules").click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

const LARGE = root("samples/large/catalog-70k.csv");

test("a 70,000-row file is read and checked in under 3 seconds @timing", async ({ page }) => {
  test.skip(!existsSync(LARGE), "Run `npm run samples -- --large 70000` first.");
  test.setTimeout(90_000);
  // Chrome's CPU throttling doesn't reach the Web Worker that does this work, so it can't
  // stand in for a slower machine here. The number reported is this machine's real time.
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(LARGE);
  await expect(page.getByTestId("check-time")).toBeVisible({ timeout: 60_000 });
  const label = (await page.getByTestId("check-time").textContent())!;
  const ms = label.endsWith(" ms") ? Number(label.slice(0, -3)) : Number(label.slice(0, -2)) * 1000;
  console.log(`70,000 rows: ${label}`);
  expect(ms).toBeLessThan(3000);
});
