import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { FirmwareChip } from "@sfab-bench/contract";

import { resolveFirmware } from "./resolve";
import type { FromWorker, ToWorker } from "./worker";

/**
 * One running machine per document. Tabs and, later, the agent tools attach
 * to the log. The thread goes away when nothing has touched it for a while,
 * which is how the last tab dropping `?device=` stops it without a client map.
 */

const IDLE_MS = 20_000;
const START_MS = 15_000;
const LOG_KEEP = 200_000;
const LOG_CAP = 400_000;

type Machine = {
  chip: FirmwareChip;
  rel: string;
  worker: Worker;
  log: string;
  base: number;
  error: string | null;
  idle: ReturnType<typeof setTimeout> | null;
};

const machines = new Map<string, Machine>();

function machineKey(project: string, rel: string) {
  return `${project}\0${rel}`;
}

function workerEntry(): string {
  for (const rel of ["./emu-worker.mjs", "./worker.ts"]) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("the emulator worker is missing beside the server bundle");
}

function trim(machine: Machine) {
  if (machine.log.length <= LOG_CAP) return;
  const drop = machine.log.length - LOG_KEEP;
  machine.log = machine.log.slice(drop);
  machine.base += drop;
}

function touch(key: string, machine: Machine) {
  if (machine.idle) clearTimeout(machine.idle);
  machine.idle = setTimeout(() => {
    void stopKey(key);
  }, IDLE_MS);
}

async function stopKey(key: string) {
  const machine = machines.get(key);
  if (!machine) return;
  machines.delete(key);
  if (machine.idle) clearTimeout(machine.idle);
  machine.worker.postMessage({ type: "stop" } satisfies ToWorker);
  await machine.worker.terminate();
}

export async function openDevice(
  project: string,
  input: string
): Promise<{ chip: FirmwareChip; path: string } | { error: string }> {
  const resolved = resolveFirmware(project, input);
  if ("error" in resolved) return resolved;
  const key = machineKey(project, resolved.rel);
  const existing = machines.get(key);
  if (existing && !existing.error) {
    touch(key, existing);
    return { chip: existing.chip, path: existing.rel };
  }
  if (existing) await stopKey(key);

  const firmware = new Uint8Array(readFileSync(resolved.abs));
  const worker = new Worker(workerEntry());
  const machine: Machine = {
    chip: resolved.chip,
    rel: resolved.rel,
    worker,
    log: "",
    base: 0,
    error: null,
    idle: null,
  };
  machines.set(key, machine);

  const started = await new Promise<
    { ok: true } | { ok: false; error: string }
  >((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, error: "emulator did not start" });
    }, START_MS);
    worker.on("message", (message: FromWorker) => {
      if (message.type === "uart") {
        machine.log += message.text;
        trim(machine);
        return;
      }
      if (message.type === "error") {
        machine.error = message.error;
        finish({ ok: false, error: message.error });
        return;
      }
      if (message.type === "ready") finish({ ok: true });
    });
    worker.on("error", (err) => {
      machine.error = err.message;
      finish({ ok: false, error: err.message });
    });
    worker.on("exit", (code) => {
      if (machines.get(key) === machine) machines.delete(key);
      finish({ ok: false, error: `emulator thread exited (${code})` });
    });
    worker.postMessage({
      type: "boot",
      chip: resolved.chip,
      firmware,
    } satisfies ToWorker);
  });

  if (!started.ok) {
    await stopKey(key);
    return { error: started.error };
  }
  touch(key, machine);
  return { chip: machine.chip, path: machine.rel };
}

export function readSerial(
  project: string,
  input: string,
  from = 0
): { text: string; next: number } | { error: string } {
  const resolved = resolveFirmware(project, input);
  if ("error" in resolved) return resolved;
  const key = machineKey(project, resolved.rel);
  const machine = machines.get(key);
  if (!machine) return { error: "device is not running" };
  touch(key, machine);
  const start = Math.max(0, from - machine.base);
  return {
    text: machine.log.slice(start),
    next: machine.base + machine.log.length,
  };
}

export function sendSerial(
  project: string,
  input: string,
  text: string
): { ok: true } | { error: string } {
  const resolved = resolveFirmware(project, input);
  if ("error" in resolved) return resolved;
  const key = machineKey(project, resolved.rel);
  const machine = machines.get(key);
  if (!machine) return { error: "device is not running" };
  const line = text.endsWith("\n") ? text : `${text}\r\n`;
  machine.worker.postMessage({ type: "uart", text: line } satisfies ToWorker);
  touch(key, machine);
  return { ok: true };
}

export async function stopDevice(
  project: string,
  input: string
): Promise<void> {
  const resolved = resolveFirmware(project, input);
  if ("error" in resolved) return;
  await stopKey(machineKey(project, resolved.rel));
}
