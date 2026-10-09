import type { FromWorker } from "../parse/protocol";

export type Loaded = Extract<FromWorker, { type: "loaded" }>;
export type Checked = Extract<FromWorker, { type: "report" }>;
