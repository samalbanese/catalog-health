import type { Report, Row, RuleSet } from "@samalbanese/catalog-rules";
import type { detectMapping, Mapping } from "./headers.ts";

/** Messages the page sends to the parsing worker. */
export type ToWorker =
  { type: "load"; name: string; bytes: ArrayBuffer } | { type: "check"; mapping: Mapping; rules: RuleSet };

/** Messages the parsing worker sends back. */
export type FromWorker =
  | {
      type: "loaded";
      /** Cells of the detected header row. */
      headers: string[];
      /** 0-based index of the header row in the file (rows above it are template notes). */
      headerRow: number;
      /** Non-blank rows below the header row. */
      rowCount: number;
      /** The first 5 data rows, as the cells appear in the file. */
      preview: string[][];
      detection: ReturnType<typeof detectMapping>;
      sheetName?: string;
      parseMs: number;
    }
  | { type: "report"; report: Report; rows: Row[]; checkMs: number }
  | { type: "error"; message: string };
