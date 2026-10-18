import type { RuleSet } from "@samalbanese/catalog-rules";
import type { Mapping } from "./headers.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

export type Loaded = Extract<FromWorker, { type: "loaded" }>;
export type Checked = Extract<FromWorker, { type: "report" }>;

export interface Checker {
  load(file: File): Promise<Loaded>;
  check(mapping: Mapping, rules: RuleSet): Promise<Checked>;
  dispose(): void;
}

const WORKER_FAILED = "The checker stopped unexpectedly. Reload the page and try again.";
const DISPOSED = "The checker was closed. Reload the page and try again.";

/**
 * Starts the parsing worker. Requests run one at a time, in the order they were
 * made, because the worker holds a single loaded file.
 */
export function createChecker(): Checker {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();
  let cancelCurrent: ((error: Error) => void) | null = null;

  /**
   * Queues one request. `prepare` runs when the request's turn comes, so work like reading a
   * file's bytes can't finish out of order and let an older file replace a newer one.
   */
  function send<T extends FromWorker["type"]>(
    prepare: () => Promise<{ message: ToWorker; transfer?: Transferable[] }>,
    expected: T,
  ): Promise<Extract<FromWorker, { type: T }>> {
    const run = async () => {
      const { message, transfer = [] } = await prepare();
      return new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
        if (disposed) {
          reject(new Error(DISPOSED));
          return;
        }
        const finish = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          cancelCurrent = null;
        };
        const onMessage = (event: MessageEvent<FromWorker>) => {
          finish();
          const reply = event.data;
          if (reply.type === "error") reject(new Error(reply.message));
          else if (reply.type === expected) resolve(reply as Extract<FromWorker, { type: T }>);
          else reject(new Error(WORKER_FAILED));
        };
        const onError = () => {
          finish();
          reject(new Error(WORKER_FAILED));
        };
        cancelCurrent = (error) => {
          finish();
          reject(error);
        };
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.postMessage(message, transfer);
      });
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    load(file) {
      return send(async () => {
        const bytes = await file.arrayBuffer();
        return { message: { type: "load", name: file.name, bytes }, transfer: [bytes] };
      }, "loaded");
    },
    check(mapping, rules) {
      return send(async () => ({ message: { type: "check", mapping, rules } }), "report");
    },
    dispose() {
      disposed = true;
      cancelCurrent?.(new Error(DISPOSED));
      worker.terminate();
    },
  };
}
