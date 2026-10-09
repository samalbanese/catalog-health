# Catalog Health Checker

[![CI](https://github.com/relaywright/catalog-health/actions/workflows/ci.yml/badge.svg)](https://github.com/relaywright/catalog-health/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Find what's broken in a product catalog before a marketplace does.** Drop in a marketplace product file and every row is checked for broken variation families, missing attributes, duplicates, and title and bullet problems. You get a health score, the problems grouped by family, and a fix list you can hand to whoever owns the data.

Your file is read in your browser tab and never uploaded.

[Open the live app](https://catalog-health.relaywright.workers.dev/)

![The sample catalog loads and scores 86 out of 100 with 66 problems, a strip marks where they sit in the file, filters narrow the list to variation families, and one family opens to show a child that repeats another child's size and color](.github/demo.webp)

## What it does

- **Reads real files.** CSV, TSV, and XLSX, including category templates that put a template row and a label row above the field names, headers written like `item_name[marketplace_id=...]#1.value`, workbooks with instruction tabs, and CSVs saved by Excel in the older Windows-1252 encoding. When column names aren't clear, it asks you to match them.
- **Scores the catalog.** A score out of 100, problem counts by severity, and a strip with one mark per row of the file, so you can see whether problems cluster in one part of it.
- **Groups problems by family.** Open a family to see the parent and its children side by side, with the problem cells marked and a plain sentence for each problem and its fix.
- **Exports a fix list.** A CSV with `sku, row, severity, field, problem, suggested_fix`, filtered to what you're looking at, safe to open in Excel.
- **Lets you change the rules.** Required attributes by product type, banned phrases, and length limits live in an editable rule set.

Try it with the **sample catalog**: an invented apparel brand, Westbrook & Co., with 310 rows and 66 problems planted on purpose. The answer key is in [`samples/answer-key.json`](samples/answer-key.json), and a test proves the checker finds exactly those 66.

## How it checks

Every check is a plain rule, so the same file always gets the same result. No AI is involved.

| Check | Severity | Fires when |
| --- | --- | --- |
| **Variation families** | blocking | A child has no parent, or points to a parent that isn't in the file or isn't marked as one |
| | warning | A parent has no children |
| | blocking | A child's theme varies on different attributes than its parent's |
| | blocking | A child is missing the size or color its family's theme varies on |
| | blocking | Two children in one family have the same size and color |
| **Required attributes** | blocking | A field the rules require for that product type (or for parents) is blank |
| | warning | The product type isn't in the rule set, so its fields can't be checked |
| **Duplicates** | blocking | The same SKU on two rows |
| | blocking | Two sellable rows share a barcode, ignoring spaces and leading zeros |
| | warning | One style number used by two families |
| | warning | Two families with the same brand, color, and title words once the size is removed |
| **Titles and bullets** | warning | A title over the length limit, or a promotional phrase in a title or bullet |
| | tidy-up | All-caps words, a title that doesn't start with the brand, too few or too many bullets, a bullet over the length limit |
| **Basics** | blocking | No SKU, no main image, or a blank or zero price on a sellable row |
| | warning | A sale price above the list price |

**The score** is the share of clean rows. A row counts fully against it when it has a blocking problem, 40% when its worst problem is a warning, and 10% when its worst is a tidy-up. Each row counts once, however many problems it has.

The built-in rules are an example modeled on common marketplace requirements, not any marketplace's official template. Edit them to match your category.

### Engineering decisions

- **A rules package with no framework in it.** `packages/rules` takes rows and returns a report. It never touches the page, React, or a file parser, so the same checks run in the browser's Web Worker, in Node scripts, and in tests.
- **Parsing and checking off the main thread.** The file is read, mapped, and checked in a Web Worker, so a large file never freezes the page.
- **Families first.** Rows are grouped into variation families before any check runs. Blank and repeated SKUs get their own place in that structure instead of being dropped, so they're reported rather than silently lost.
- **One message per problem.** When a child is missing the size its theme needs, that's reported as a variation problem, not again as a missing required field. A parent with no theme is reported once on the parent, not on every child.
- **An answer key, not a hope.** The sample generator plants each kind of problem, writes down where, and the test fails if the checker finds anything more or less.
- **Fix lists that can't run code.** Cells that start with `=`, `+`, `-`, or `@` are escaped, because a catalog's own text can look like a spreadsheet formula.
- **SheetJS from its official source.** The npm `xlsx` package stopped receiving updates, so the dependency is pinned to the SheetJS CDN release.

## Performance

70,000 rows (a 25 MB CSV), read, mapped, and checked, timed by the app itself in Chromium:

| Machine | Median of 5 | Range |
| --- | --- | --- |
| Desktop, AMD Ryzen 7 5800X3D, 32 GB, Windows 11 | 0.88 s | 0.86 to 1.0 s |

The browser test suite fails if this takes 3 seconds or more. `npm run bench` times the same work in Node.

## Run locally

Node 22 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for every rule, the parsers, the export, and the sample's answer key |
| `npm run test:e2e` | Browser tests, including accessibility scans at phone and desktop widths |
| `npm run samples` | Regenerates the sample catalog and answer key |
| `npm run samples -- --large 70000` | Writes a 70,000-row file to `samples/large/` for the timing test |
| `npm run bench` | Times parsing and checking 70,000 rows in Node |

## License

[MIT](LICENSE). The sample catalog is invented: Westbrook & Co. is not a real brand, barcodes use the `04` prefix reserved for in-store use, and image links point to `example.com`.
