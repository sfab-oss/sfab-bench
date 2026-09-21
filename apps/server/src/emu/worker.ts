import { parentPort } from "node:worker_threads";

import {
  loadEmulator,
  RUN_BATCH_CYCLES,
  type RunningEmulator,
  uartText,
} from "./runtime";

/**
 * One emulator, on a thread that is not the server's. `emu/host.ts` starts
 * one of these per open document. Killing the thread is how a machine stops.
 */

export type ToWorker =
  | { type: "boot"; chip: string; firmware: Uint8Array }
  | { type: "uart"; text: string }
  | { type: "stop" };

export type FromWorker =
  | { type: "ready" }
  | { type: "uart"; text: string }
  | { type: "error"; error: string };

const port = parentPort;
const pending: string[] = [];
let stopped = false;
let emu: RunningEmulator | null = null;

function post(message: FromWorker) {
  port?.postMessage(message);
}

async function pump() {
  const running = emu;
  if (!running) return;
  while (!stopped) {
    while (pending.length > 0) {
      const text = pending.shift() ?? "";
      running.uart_input(new TextEncoder().encode(text));
    }
    const chunk = uartText(running.run_batch(RUN_BATCH_CYCLES));
    if (chunk) post({ type: "uart", text: chunk });
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function boot(chip: string, firmware: Uint8Array) {
  try {
    emu = await loadEmulator(chip);
    emu.load_firmware(firmware);
    post({ type: "ready" });
    await pump();
  } catch (err: unknown) {
    post({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

if (port) {
  port.on("message", (message: ToWorker) => {
    if (message.type === "boot") {
      void boot(message.chip, message.firmware);
      return;
    }
    if (message.type === "uart") pending.push(message.text);
    if (message.type === "stop") stopped = true;
  });
}
