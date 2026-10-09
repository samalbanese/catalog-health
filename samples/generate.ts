// Seeded generator for the fictional "Westbrook & Co." sample catalog.
//
//   npm run samples                    writes samples/westbrook-catalog.csv and samples/answer-key.json
//   npm run samples -- --large 70000   writes samples/large/catalog-70k.csv (clean, for timing)
//
// Everything here is invented: the brand, the style names, the SKUs, and the barcodes.
// Barcodes start with 04 and carry a valid check digit. Image links use example.com.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FIELDS, exampleRules, runChecks } from "../packages/rules/src/index.ts";
import type { FieldKey, IssueCode, Row } from "../packages/rules/src/index.ts";

export type Rec = Record<FieldKey, string>;
export interface AnswerKeyEntry {
  code: IssueCode;
  sku: string;
  field: string;
}
export interface GenerateOptions {
  seed: number;
  families: number;
  standalone: number;
  plant: boolean;
  /** When set, build whole families, then standalone rows, until exactly this many rows exist. */
  targetRows?: number;
}

export const SAMPLE_OPTIONS: GenerateOptions = { seed: 20261008, families: 40, standalone: 20, plant: true };

const BRAND = "Westbrook & Co.";

// ---------------------------------------------------------------------------
// Small seeded helpers

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ---------------------------------------------------------------------------
// Invented product vocabulary

const FIRST_WORDS = [
  "Marlow",
  "Alder",
  "Calder",
  "Fenwick",
  "Harbor",
  "Juniper",
  "Kestrel",
  "Linden",
  "Meadow",
  "Oriel",
  "Pembroke",
  "Rowan",
  "Sutton",
  "Thistle",
  "Willow",
  "Briar",
  "Cobble",
  "Dunmore",
  "Elmhurst",
  "Foxglove",
  "Gable",
  "Hollis",
  "Ivybridge",
  "Kingsley",
  "Larkspur",
  "Maple",
  "Northgate",
  "Oakley",
  "Primrose",
  "Quarry",
  "Ridgeway",
  "Saltmarsh",
  "Tamarack",
  "Upland",
  "Vesper",
  "Wexford",
  "Yarrow",
  "Aspen",
  "Birch",
  "Cedar",
] as const;

type ProductType = "DRESS" | "SHIRT" | "COAT";

const FORMS: Record<ProductType, readonly string[]> = {
  DRESS: ["Wrap Dress", "Shirt Dress", "Midi Dress", "Slip Dress", "Sundress", "Knit Dress", "Tiered Dress"],
  SHIRT: ["Oxford Shirt", "Linen Shirt", "Camp Shirt", "Poplin Blouse", "Henley Top", "Pocket Tee"],
  COAT: ["Trench Coat", "Wool Coat", "Rain Jacket", "Quilted Coat", "Field Jacket", "Wrap Coat"],
};

const MATERIALS: Record<ProductType, readonly string[]> = {
  DRESS: ["Cotton", "Viscose", "Linen", "Cotton Blend"],
  SHIRT: ["Cotton", "Linen", "Cotton Blend"],
  COAT: ["Wool", "Polyester", "Cotton Blend"],
};

const PRICE_RANGE: Record<ProductType, [number, number]> = {
  DRESS: [58, 148],
  SHIRT: [38, 88],
  COAT: [98, 248],
};

const COLORS = [
  { name: "Navy", code: "NVY" },
  { name: "Black", code: "BLK" },
  { name: "Ivory", code: "IVY" },
  { name: "Sage", code: "SAG" },
  { name: "Rust", code: "RST" },
  { name: "Charcoal", code: "CHR" },
  { name: "Dusty Rose", code: "ROS" },
  { name: "Cobalt", code: "CBL" },
] as const;

const SIZES = ["XS", "S", "M", "L", "XL"] as const;

const BULLETS: Record<ProductType, readonly (readonly string[])[]> = {
  DRESS: [
    [
      "Soft fabric with an easy drape",
      "Light fabric that moves with you",
      "Smooth fabric with a little stretch",
    ],
    [
      "Cut to flatter the waist and hip",
      "Relaxed fit through the body",
      "Fitted bodice with a flowing skirt",
    ],
    ["Falls just below the knee", "Hits at the midi length for all-day comfort", "Hem sits at the calf"],
    ["Machine washable and easy to care for", "Wash cold and hang to dry", "Holds its shape wash after wash"],
    [
      "Designed by the Westbrook & Co. studio",
      "Pairs with flats, boots, or sneakers",
      "Easy to dress up or down",
    ],
  ],
  SHIRT: [
    [
      "Crisp fabric that softens with every wash",
      "Breathable weave for warm days",
      "Smooth hand feel with a light finish",
    ],
    [
      "Classic collar and button front",
      "Relaxed fit that layers well",
      "Straight hem that tucks or stays out",
    ],
    [
      "Chest pocket for a simple finish",
      "Curved hem for a neat line",
      "Roll-tab sleeves for a quick change in length",
    ],
    ["Machine washable and easy to care for", "Wash cold and tumble dry low", "Needs only a light press"],
    [
      "Designed by the Westbrook & Co. studio",
      "Works from the office to the weekend",
      "A wardrobe staple in every season",
    ],
  ],
  COAT: [
    [
      "Midweight fabric for cool days",
      "Smooth outer shell with a soft lining",
      "Structured fabric that keeps its shape",
    ],
    [
      "Full-length front closure with a storm flap",
      "Wide lapels and a belted waist",
      "Roomy cut to fit over a sweater",
    ],
    ["Two deep front pockets", "Inside pocket for small essentials", "Adjustable cuffs to keep out the cold"],
    ["Dry clean or spot clean as needed", "Wipe clean and air dry", "Hang to air out between wears"],
    [
      "Designed by the Westbrook & Co. studio",
      "Built to last through many seasons",
      "A layering piece you will reach for often",
    ],
  ],
};

const LONG_TITLE_TAIL =
  " with Adjustable Waist Tie, Side Pockets, Breathable Lining, Relaxed Fit for Everyday Wear, Easy Care Fabric, and a Soft Hand Feel in Every Season";
const LONG_BULLET =
  "This piece is made from a carefully chosen fabric that feels soft against the skin, keeps its color through repeated washing, resists pilling, and holds its shape through a full day of wear, with reinforced seams at every stress point, a hidden pocket for small items, and a finish that keeps the surface looking fresh from the first wear to the fiftieth.";

// ---------------------------------------------------------------------------
// Barcodes: 04 + nine digits + a valid UPC-A check digit, unique per counter value.

export function upcCheckDigit(first11: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(first11[i]);
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

export function makeUpc(counter: number): string {
  // 7919 is coprime with 10^9, so different counters always give different digits.
  const nine = String((counter * 7919 + 104729) % 1_000_000_000).padStart(9, "0");
  const first11 = `04${nine}`;
  return `${first11}${upcCheckDigit(first11)}`;
}

// ---------------------------------------------------------------------------
// Row builders

function emptyRec(): Rec {
  const rec = {} as Rec;
  for (const f of FIELDS) rec[f] = "";
  return rec;
}

interface Spec {
  index: number;
  style: string;
  name: string;
  type: ProductType;
  material: string;
  price: number;
}

interface Entry {
  rec: Rec;
  kind: "parent" | "child" | "standalone" | "extra";
  fam: number;
  name: string;
  color: string;
  size: string;
}

interface FamilyInfo {
  spec: Spec;
  parent: Entry;
  children: Entry[];
}

const imageUrl = (sku: string): string => `https://example.com/westbrook/${sku.toLowerCase()}.jpg`;
const money = (n: number): string => n.toFixed(2);

export function generateCatalog(options: GenerateOptions): { rows: Rec[]; answerKey: AnswerKeyEntry[] } {
  const rng = new Rng(options.seed);
  const answerKey: AnswerKeyEntry[] = [];

  // Unique product names: every first word with every form, shuffled; "Edition N" once those run out.
  const combos: { first: string; form: string; type: ProductType }[] = [];
  for (const first of FIRST_WORDS) {
    for (const type of Object.keys(FORMS) as ProductType[]) {
      for (const form of FORMS[type]) combos.push({ first, form, type });
    }
  }
  const nameOrder = rng.shuffle(combos);
  let specCount = 0;
  let upcCounter = 1;

  function nextSpec(): Spec {
    const index = specCount++;
    const combo = nameOrder[index % nameOrder.length];
    const edition = Math.floor(index / nameOrder.length);
    const [lo, hi] = PRICE_RANGE[combo.type];
    return {
      index,
      style: `WB-${1001 + index}`,
      name: `${combo.first} ${combo.form}${edition > 0 ? ` Edition ${edition + 1}` : ""}`,
      type: combo.type,
      material: rng.pick(MATERIALS[combo.type]),
      price: rng.range(lo, hi),
    };
  }

  function baseRec(spec: Spec, sku: string, title: string): Rec {
    const rec = emptyRec();
    rec.item_sku = sku;
    rec.feed_product_type = spec.type;
    rec.item_name = title;
    rec.brand_name = BRAND;
    rec.style_number = spec.style;
    rec.department_name = "Womens";
    rec.material_type = spec.material;
    rec.main_image_url = imageUrl(sku);
    return rec;
  }

  function sellable(rec: Rec, spec: Spec, color: string, size: string): void {
    rec.external_product_id = makeUpc(upcCounter++);
    rec.color_name = color;
    rec.size_name = size;
    BULLETS[spec.type].forEach((choices, i) => {
      rec[`bullet_point${i + 1}` as FieldKey] = rng.pick(choices);
    });
    rec.standard_price = money(spec.price);
    rec.sale_price = rng.next() < 0.2 ? money(spec.price - rng.range(5, 15)) : "";
  }

  const titleFor = (spec: Spec, color: string, size: string): string =>
    `${BRAND} ${spec.name}, ${color}, ${size}`;

  function parentEntry(spec: Spec, fam: number): Entry {
    const rec = baseRec(spec, spec.style, `${BRAND} ${spec.name}`);
    rec.parent_child = "Parent";
    rec.variation_theme = "SizeColor";
    return { rec, kind: "parent", fam, name: spec.name, color: "", size: "" };
  }

  function childEntry(
    spec: Spec,
    fam: number,
    color: { name: string; code: string },
    size: string,
    parentSku: string,
  ): Entry {
    const rec = baseRec(spec, `${spec.style}-${color.code}-${size}`, titleFor(spec, color.name, size));
    sellable(rec, spec, color.name, size);
    rec.parent_child = "Child";
    rec.parent_sku = parentSku;
    rec.variation_theme = "SizeColor";
    return { rec, kind: "child", fam, name: spec.name, color: color.name, size };
  }

  function standaloneEntry(spec: Spec, fam: number): Entry {
    const color = rng.pick(COLORS);
    const size = rng.pick(SIZES);
    const rec = baseRec(spec, `${spec.style}-${color.code}-${size}`, titleFor(spec, color.name, size));
    sellable(rec, spec, color.name, size);
    return { rec, kind: "standalone", fam, name: spec.name, color: color.name, size };
  }

  // -------------------------------------------------------------------------
  // The clean catalog

  const entries: Entry[] = [];
  const families: FamilyInfo[] = [];
  const standalones: Entry[] = [];

  // Children per family: 3 to 10, as sizes x colors.
  const SHAPES: Record<number, [number, number]> = {
    3: [3, 1],
    4: [4, 1],
    5: [5, 1],
    6: [3, 2],
    8: [4, 2],
    10: [5, 2],
  };
  const shapePattern = [4, 6, 5, 8, 3, 6, 10, 5, 6, 4];

  function addFamily(): number {
    const spec = nextSpec();
    const fam = families.length;
    const total = shapePattern[rng.int(shapePattern.length)];
    const [nSizes, nColors] = SHAPES[total];
    const start = rng.int(SIZES.length - nSizes + 1);
    const sizes = SIZES.slice(start, start + nSizes);
    const colors = rng.shuffle(COLORS).slice(0, nColors);
    const parent = parentEntry(spec, fam);
    const info: FamilyInfo = { spec, parent, children: [] };
    entries.push(parent);
    for (const color of colors) {
      for (const size of sizes) {
        const child = childEntry(spec, fam, color, size, spec.style);
        info.children.push(child);
        entries.push(child);
      }
    }
    families.push(info);
    return total + 1;
  }

  function addStandalone(): void {
    const e = standaloneEntry(nextSpec(), -1);
    standalones.push(e);
    entries.push(e);
  }

  if (options.targetRows !== undefined) {
    // Whole families while they fit, then standalone rows to land exactly on the target.
    // A family adds at most 11 rows, so this loop never overshoots the target.
    while (entries.length < options.targetRows - 11) addFamily();
    while (entries.length < options.targetRows) addStandalone();
  } else {
    for (let i = 0; i < options.families; i++) addFamily();
    for (let i = 0; i < options.standalone; i++) addStandalone();
  }

  // -------------------------------------------------------------------------
  // Planted problems

  if (options.plant) {
    const key = (code: IssueCode, rec: Rec, field: string): void => {
      answerKey.push({ code, sku: rec.item_sku, field });
    };

    // Family-level problems each get their own family, so they never overlap.
    const famPool = rng.shuffle(families.map((_, i) => i));
    const reserved = new Set<number>();
    const takeFamily = (): FamilyInfo => {
      const i = famPool.pop();
      if (i === undefined) throw new Error("Not enough families for the planted problems.");
      reserved.add(i);
      return families[i];
    };

    // theme-mismatch x3: a child declares a different theme than its parent.
    for (const theme of ["Size", "Color", "Style"]) {
      const child = takeFamily().children[1];
      child.rec.variation_theme = theme;
      key("theme-mismatch", child.rec, "variation_theme");
    }

    // duplicate-variant x3: the last child copies the first child's size and color.
    for (let n = 0; n < 3; n++) {
      const kids = takeFamily().children;
      const last = kids[kids.length - 1];
      last.rec.size_name = kids[0].rec.size_name;
      last.rec.color_name = kids[0].rec.color_name;
      key("duplicate-variant", last.rec, "");
    }

    // missing-theme-attribute x4: a child leaves size or color blank.
    for (const field of ["size_name", "color_name", "size_name", "color_name"] as const) {
      const child = takeFamily().children[1];
      child.rec[field] = "";
      key("missing-theme-attribute", child.rec, field);
    }

    // missing-required (1 of 6): a parent with no title.
    {
      const parent = takeFamily().parent;
      parent.rec.item_name = "";
      key("missing-required", parent.rec, "item_name");
    }

    // duplicate-style, group 1: a standalone row reuses a family's style number.
    const styleFamily = takeFamily();

    const childPool = rng.shuffle(families.flatMap((f, i) => (reserved.has(i) ? [] : f.children)));
    const takeChild = (): Entry => {
      const e = childPool.pop();
      if (e === undefined) throw new Error("Not enough children for the planted problems.");
      return e;
    };
    const standalonePool = rng.shuffle(standalones);
    const takeStandalone = (): Entry => {
      const e = standalonePool.pop();
      if (e === undefined) throw new Error("Not enough standalone rows for the planted problems.");
      return e;
    };

    {
      const s = takeStandalone();
      s.rec.style_number = styleFamily.spec.style;
      key("duplicate-style", styleFamily.parent.rec, "style_number");
      key("duplicate-style", s.rec, "style_number");
    }
    // duplicate-style, group 2: two standalone rows share a style number.
    {
      const a = takeStandalone();
      const b = takeStandalone();
      b.rec.style_number = a.rec.style_number;
      key("duplicate-style", a.rec, "style_number");
      key("duplicate-style", b.rec, "style_number");
    }

    // missing-required (5 more), on rows of different kinds.
    {
      const c1 = takeChild();
      c1.rec.material_type = "";
      key("missing-required", c1.rec, "material_type");
      const c2 = takeChild();
      c2.rec.department_name = "";
      key("missing-required", c2.rec, "department_name");
      const c3 = takeChild();
      c3.rec.external_product_id = "";
      key("missing-required", c3.rec, "external_product_id");
      const s1 = takeStandalone();
      s1.rec.brand_name = "";
      key("missing-required", s1.rec, "brand_name");
      const s2 = takeStandalone();
      s2.rec.material_type = "";
      key("missing-required", s2.rec, "material_type");
    }

    // unknown-product-type x2
    for (const type of ["SKIRT", "VEST"]) {
      const s = takeStandalone();
      s.rec.feed_product_type = type;
      key("unknown-product-type", s.rec, "feed_product_type");
    }

    // duplicate-external-id x2 groups of 2: a standalone pair and a child pair.
    {
      const a = takeStandalone();
      const b = takeStandalone();
      b.rec.external_product_id = a.rec.external_product_id;
      key("duplicate-external-id", a.rec, "external_product_id");
      key("duplicate-external-id", b.rec, "external_product_id");
      const c = takeChild();
      const d = takeChild();
      d.rec.external_product_id = c.rec.external_product_id;
      key("duplicate-external-id", c.rec, "external_product_id");
      key("duplicate-external-id", d.rec, "external_product_id");
    }

    // near-duplicate-title x2 groups of 2: same product name and color, different size, in two families.
    {
      const a = takeStandalone();
      const b = takeStandalone();
      b.rec.color_name = a.color;
      b.rec.item_name = `${BRAND} ${a.name}, ${a.color}, ${b.size}`;
      key("near-duplicate-title", a.rec, "item_name");
      key("near-duplicate-title", b.rec, "item_name");
      const c = takeStandalone();
      const d = takeStandalone();
      const swapped = c.name.split(" ").reverse().join(" ");
      d.rec.color_name = c.color;
      d.rec.item_name = `${BRAND} ${swapped}, ${c.color}, ${d.size}`;
      key("near-duplicate-title", c.rec, "item_name");
      key("near-duplicate-title", d.rec, "item_name");
    }

    // title-too-long x3
    for (const e of [takeChild(), takeChild(), takeStandalone()]) {
      e.rec.item_name = `${e.rec.item_name}${LONG_TITLE_TAIL}`;
      key("title-too-long", e.rec, "item_name");
    }

    // banned-phrase x4: two titles, two bullets.
    {
      const t1 = takeChild();
      t1.rec.item_name = `${t1.rec.item_name} - Best Seller`;
      key("banned-phrase", t1.rec, "item_name");
      const t2 = takeChild();
      t2.rec.item_name = `${t2.rec.item_name}, Free Shipping!`;
      key("banned-phrase", t2.rec, "item_name");
      const b1 = takeChild();
      b1.rec.bullet_point2 = "Our hot deal of the season on a soft, easy-care fabric";
      key("banned-phrase", b1.rec, "bullet_point2");
      const b2 = takeChild();
      b2.rec.bullet_point4 = "Limited time offer on a machine washable fabric";
      key("banned-phrase", b2.rec, "bullet_point4");
    }

    // all-caps-word x3
    for (const [word, e] of [
      ["PREMIUM", takeChild()],
      ["LIGHTWEIGHT", takeChild()],
      ["BREATHABLE", takeStandalone()],
    ] as const) {
      e.rec.item_name = `${BRAND} ${e.name} ${word}, ${e.color}, ${e.size}`;
      key("all-caps-word", e.rec, "item_name");
    }

    // title-brand-prefix x3
    for (const e of [takeChild(), takeChild(), takeStandalone()]) {
      e.rec.item_name = `${e.name} by ${BRAND}, ${e.color}, ${e.size}`;
      key("title-brand-prefix", e.rec, "item_name");
    }

    // bullet-count x3: two, one, and two bullets.
    for (const keep of [2, 1, 2]) {
      const e = takeChild();
      for (let i = keep + 1; i <= 5; i++) e.rec[`bullet_point${i}` as FieldKey] = "";
      key("bullet-count", e.rec, "");
    }

    // bullet-too-long x2
    for (const field of ["bullet_point3", "bullet_point5"] as const) {
      const e = takeChild();
      e.rec[field] = LONG_BULLET;
      key("bullet-too-long", e.rec, field);
    }

    // missing-sku x1: a child with no SKU of its own, still attached to its parent.
    {
      const e = takeChild();
      e.rec.item_sku = "";
      key("missing-sku", e.rec, "item_sku");
    }

    // missing-image x4
    for (let n = 0; n < 4; n++) {
      const e = takeChild();
      e.rec.main_image_url = "";
      key("missing-image", e.rec, "main_image_url");
    }

    // missing-price x3: blank, 0, and $0.00 (sale price cleared so nothing else fires).
    for (const value of ["", "0", "$0.00"]) {
      const e = takeChild();
      e.rec.standard_price = value;
      e.rec.sale_price = "";
      key("missing-price", e.rec, "standard_price");
    }

    // sale-above-list x3
    for (let n = 0; n < 3; n++) {
      const e = takeChild();
      e.rec.sale_price = money(Number(e.rec.standard_price) + 12);
      key("sale-above-list", e.rec, "sale_price");
    }

    // Extra rows, each its own isolated style so they touch nothing else.
    const extras: Entry[] = [];
    const color = (n: number) => COLORS[n % COLORS.length];

    // orphan-child x3, one of each kind.
    {
      const spec = nextSpec();
      const e = childEntry(spec, -1, color(spec.index), "M", "");
      extras.push(e);
      key("orphan-child", e.rec, "parent_sku");
    }
    {
      const spec = nextSpec();
      const e = childEntry(spec, -1, color(spec.index), "L", spec.style);
      extras.push(e);
      key("orphan-child", e.rec, "parent_sku");
    }
    {
      const spec = nextSpec();
      const target = takeStandalone();
      const e = childEntry(spec, -1, color(spec.index), "S", target.rec.item_sku);
      extras.push(e);
      key("orphan-child", e.rec, "parent_sku");
    }

    // childless-parent x2
    for (let n = 0; n < 2; n++) {
      const e = parentEntry(nextSpec(), -1);
      extras.push(e);
      key("childless-parent", e.rec, "");
    }

    // duplicate-sku x2: a new product given the SKU of an existing standalone row.
    for (let n = 0; n < 2; n++) {
      const original = takeStandalone();
      const e = standaloneEntry(nextSpec(), -1);
      e.rec.item_sku = original.rec.item_sku;
      extras.push(e);
      key("duplicate-sku", e.rec, "item_sku");
    }

    for (const e of extras) entries.push({ ...e, kind: "extra" });
  }

  return { rows: entries.map((e) => e.rec), answerKey };
}

// ---------------------------------------------------------------------------
// CSV

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 quoting, header row = FIELDS, `\n` line endings, trailing newline. */
export function toCsv(rows: Rec[]): string {
  const lines = [FIELDS.join(",")];
  for (const rec of rows) lines.push(FIELDS.map((f) => csvCell(rec[f])).join(","));
  return `${lines.join("\n")}\n`;
}

/** The same rows the app would build from this file: line numbers start at 2. */
export function toEngineRows(rows: Rec[]): Row[] {
  return rows.map((rec, i) => ({ rowNumber: i + 2, fields: { ...rec } }));
}

// ---------------------------------------------------------------------------
// Command line

function main(): void {
  const here = fileURLToPath(new URL("./", import.meta.url));
  const args = process.argv.slice(2);
  const largeAt = args.indexOf("--large");

  if (largeAt >= 0) {
    const n = Number(args[largeAt + 1] ?? "70000");
    if (!Number.isInteger(n) || n < 100)
      throw new Error("--large needs a row count of 100 or more, like --large 70000.");
    const { rows } = generateCatalog({
      seed: SAMPLE_OPTIONS.seed,
      families: 0,
      standalone: 0,
      plant: false,
      targetRows: n,
    });
    mkdirSync(`${here}large`, { recursive: true });
    writeFileSync(`${here}large/catalog-${Math.round(n / 1000)}k.csv`, toCsv(rows), "utf8");
    console.log(`Wrote samples/large/catalog-${Math.round(n / 1000)}k.csv with ${rows.length} rows.`);
    return;
  }

  const { rows, answerKey } = generateCatalog(SAMPLE_OPTIONS);
  writeFileSync(`${here}westbrook-catalog.csv`, toCsv(rows), "utf8");
  writeFileSync(`${here}answer-key.json`, `${JSON.stringify(answerKey, null, 2)}\n`, "utf8");
  console.log(
    `Wrote samples/westbrook-catalog.csv (${rows.length} rows) and samples/answer-key.json (${answerKey.length} planted issues).`,
  );

  // Cross-check the engine against the key right away, so a stale key shows up here too.
  const report = runChecks(toEngineRows(rows), exampleRules);
  const found = new Set(report.issues.map((i) => `${i.code}|${i.sku}|${i.field}`));
  const planted = new Set(answerKey.map((a) => `${a.code}|${a.sku}|${a.field}`));
  const missing = [...planted].filter((k) => !found.has(k));
  const extra = [...found].filter((k) => !planted.has(k));
  if (missing.length > 0 || extra.length > 0) {
    console.error("The engine's issues do not match the answer key.");
    for (const k of missing) console.error(`  planted but not found: ${k}`);
    for (const k of extra) console.error(`  found but not planted: ${k}`);
    process.exitCode = 1;
  } else {
    console.log(`Engine and answer key agree: ${found.size} issues, score ${report.score}.`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
