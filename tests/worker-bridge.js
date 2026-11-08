// Node adapter for the actual browser worker module; no evaluator substitution.
import { parentPort, workerData } from "node:worker_threads";
globalThis.self = { postMessage: (data) => parentPort.postMessage(data) };
await import(workerData);
parentPort.on("message", (data) => self.onmessage({ data }));
