import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  SERIAL_TEXT_MAX,
  type WorldError,
  type WorldSender,
  type WorldServerMessage,
  type WorldState,
} from "@sfab-bench/contract";

import { subscribeRootWatch } from "../projects";
import {
  dependencyRels,
  dependencyStamp,
  type FirmwareWatch,
  firmwareWatch,
  projectReal,
} from "./files";
import { type SerialPage, SerialRing } from "./serial-ring";
import type { FromWorker, ToWorker } from "./worker";

/**
 * One running world per document. Subscribers share play state, sim time,
 * and poses (D-015). The thread goes away when the host stops the document,
 * or after a quiet spell with nobody attached — the same idle idea as the
 * mcu host, with an explicit subscriber list because a world socket detaches.
 */

const IDLE_MS = 20_000;
const START_MS = 20_000;

export type WorldSubscription = {
  sender: WorldSender;
  onEvent: (event: WorldServerMessage) => void;
};

export type WorldHandle = {
  play: (nonce?: string) => void;
  pause: (nonce?: string) => void;
  step: (n: number) => void;
  sendSerial: (
    board: string,
    text: string,
    nonce?: string
  ) => { ok: true } | { error: string };
  detach: () => void;
};

type Sub = WorldSubscription & { delivered: boolean; detached: boolean };

type Doc = {
  key: string;
  project: string;
  world: string;
  subs: Set<Sub>;
  worker: Worker | null;
  generation: number;
  lastState: WorldState | null;
  /** Last play or pause, so a subscriber who attaches later can show who sent it. */
  lastCommand: {
    command: "play" | "pause";
    by: WorldSender;
    nonce?: string;
  } | null;
  errors: WorldError[] | null;
  errorMessage?: string;
  ready: boolean;
  busy: Promise<void> | null;
  idle: ReturnType<typeof setTimeout> | null;
  unwatch: (() => void) | null;
  deps: string[];
  stamp: string;
  firmware: FirmwareWatch[];
  serial: Map<string, SerialRing>;
  rx: Map<string, { queued: number; accepted: number }>;
  stopping: boolean;
};

const docs = new Map<string, Doc>();
const liveWorkers = new Set<Worker>();

export function worldWorkerCount(): number {
  return liveWorkers.size;
}

/** Bundled, the worker sits beside the server bundle. From a checkout it is the TypeScript next to this file, which tsx loads. */
export function worldWorkerEntry(): string {
  for (const rel of ["./world-worker.mjs", "./worker.ts"]) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("the world worker is missing beside the server bundle");
}

function docKey(
  project: string,
  worldRel: string
): { key: string; project: string; world: string } | { error: string } {
  const root = projectReal(project);
  if (!root) return { error: "the project folder is gone" };
  const world = worldRel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!world || !world.toLowerCase().endsWith(".world.json")) {
    return { error: "not a world document" };
  }
  if (world.split("/").includes("..")) {
    return { error: "path escapes the project" };
  }
  return { key: `${root}\0${world}`, project: root, world };
}

function broadcast(doc: Doc, event: WorldServerMessage) {
  for (const sub of doc.subs) {
    if (sub.detached) continue;
    sub.delivered = true;
    try {
      sub.onEvent(structuredClone(event));
    } catch {
      /* a subscriber that throws does not stop the others */
    }
  }
}

function snapshot(doc: Doc): WorldServerMessage | null {
  if (doc.errors) {
    return {
      type: "error",
      errors: doc.errors,
      ...(doc.errorMessage ? { message: doc.errorMessage } : {}),
    };
  }
  if (doc.lastState) return { type: "state", state: doc.lastState };
  return null;
}

function commandEvent(
  command: "play" | "pause",
  by: WorldSender,
  nonce?: string
): WorldServerMessage {
  return {
    type: "command",
    command,
    by,
    ...(nonce ? { nonce } : {}),
  };
}

function announce(
  doc: Doc,
  command: "play" | "pause",
  by: WorldSender,
  nonce?: string
) {
  doc.lastCommand = { command, by, ...(nonce ? { nonce } : {}) };
  broadcast(doc, commandEvent(command, by, nonce));
}

function sendSnapshot(sub: Sub, doc: Doc) {
  const event = snapshot(doc);
  if (event) {
    sub.delivered = true;
    sub.onEvent(structuredClone(event));
  }
  // The command follows the state, so a late joiner sees who last played
  // or paused without folding that into the physics snapshot.
  // A runtime fault sets `errorMessage` only. The state snapshot above
  // does not carry it, so send the fault as its own error event.
  if (event?.type === "state" && doc.errorMessage) {
    sub.delivered = true;
    sub.onEvent(
      structuredClone({
        type: "error",
        errors: [],
        message: doc.errorMessage,
      } satisfies WorldServerMessage)
    );
  }
  if (event?.type === "state" && doc.lastCommand) {
    sub.delivered = true;
    sub.onEvent(
      structuredClone(
        commandEvent(
          doc.lastCommand.command,
          doc.lastCommand.by,
          doc.lastCommand.nonce
        )
      )
    );
  }
  if (event?.type === "state") sendSerialTails(sub, doc);
}

function ringOf(doc: Doc, board: string): SerialRing {
  let ring = doc.serial.get(board);
  if (!ring) {
    ring = new SerialRing();
    doc.serial.set(board, ring);
  }
  return ring;
}

function sendSerialTails(sub: Sub, doc: Doc) {
  for (const id of Object.keys(doc.lastState?.boards ?? {})) {
    const ring = doc.serial.get(id);
    if (!ring || ring.next === 0) continue;
    const page = ring.tail(SERIAL_TEXT_MAX);
    if (!page.text) continue;
    sub.delivered = true;
    sub.onEvent(
      structuredClone({
        type: "serial",
        board: id,
        text: page.text,
        next: page.next,
      } satisfies WorldServerMessage)
    );
  }
}

function resetSerial(doc: Doc) {
  doc.serial = new Map();
  doc.rx = new Map();
}

function refreshDeps(doc: Doc) {
  doc.deps = dependencyRels(doc.project, doc.world);
  doc.stamp = dependencyStamp(doc.project, doc.deps);
}

function tie(doc: Doc) {
  if (!doc.worker) return;
  if (doc.subs.size > 0) doc.worker.ref();
  else doc.worker.unref();
}

function armIdle(doc: Doc) {
  if (doc.idle) clearTimeout(doc.idle);
  if (doc.subs.size > 0) {
    doc.idle = null;
    return;
  }
  doc.idle = setTimeout(() => {
    void stopKey(doc.key);
  }, IDLE_MS);
  doc.idle.unref();
}

async function killWorker(doc: Doc): Promise<void> {
  const worker = doc.worker;
  if (!worker) return;
  doc.worker = null;
  doc.stopping = true;
  try {
    worker.postMessage({ type: "stop" } satisfies ToWorker);
  } catch {
    /* already gone */
  }
  const exited = new Promise<void>((resolve) => {
    worker.once("exit", () => resolve());
  });
  await worker.terminate();
  await exited;
  doc.stopping = false;
}

/**
 * The thread is gone. Drop it from the live set and remember the failure
 * so the next attach, or a file change, can build again. Idempotent:
 * `error` and `exit` both call this, and the second one finds no worker.
 */
function markWorkerFailed(doc: Doc, worker: Worker, message: string) {
  liveWorkers.delete(worker);
  if (doc.worker !== worker) return;
  doc.worker = null;
  if (doc.stopping) return;
  doc.errors = [];
  doc.errorMessage = message;
  doc.lastState = null;
  broadcast(doc, { type: "error", errors: [], message });
}

function listen(doc: Doc, worker: Worker) {
  worker.on("message", (message: FromWorker) => {
    if (message.generation !== doc.generation) return;
    if (message.type === "state") {
      doc.lastState = message.state;
      doc.errors = null;
      // A caught step fault stays until the run is playing again. The
      // paused state posted right after the fault must not clear it.
      if (message.state.playing) doc.errorMessage = undefined;
      broadcast(doc, { type: "state", state: message.state });
      return;
    }
    if (message.type === "serial") {
      for (const chunk of message.chunks) {
        const ring = ringOf(doc, chunk.board);
        const before = ring.next;
        ring.append(chunk.text);
        const page = ring.read(before);
        broadcast(doc, {
          type: "serial",
          board: chunk.board,
          text: page.text,
          next: page.next,
        });
      }
      return;
    }
    if (message.type === "boardReset") {
      const ring = ringOf(doc, message.board);
      ring.clear(message.marker);
      const page = ring.read(ring.next - message.marker.length);
      broadcast(doc, {
        type: "serial",
        board: message.board,
        text: page.text || message.marker,
        next: ring.next,
      });
      return;
    }
    if (message.type === "boardFault") {
      broadcast(doc, {
        type: "board-error",
        board: message.board,
        message: message.message,
      });
      return;
    }
    if (message.type === "rx") {
      doc.rx.set(message.board, {
        queued: message.queued,
        accepted: message.accepted,
      });
      return;
    }
    if (message.type === "error") {
      doc.errorMessage = message.message;
      if (message.errors.length > 0) {
        doc.errors = message.errors;
        doc.lastState = null;
      }
      broadcast(doc, {
        type: "error",
        errors: message.errors,
        ...(message.message ? { message: message.message } : {}),
      });
    }
  });
  // An unhandled worker exception emits `error`. With no listener, Node 24
  // takes down the parent. Never rethrow.
  worker.on("error", (err: Error) => {
    console.error("[world]", err);
    markWorkerFailed(doc, worker, err.message);
  });
  worker.on("exit", () => {
    markWorkerFailed(doc, worker, "world worker exited");
  });
}

function waitForResult(worker: Worker, generation: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("world did not start"));
    }, START_MS);
    const onMessage = (message: FromWorker) => {
      if (message.generation !== generation) return;
      if (message.type !== "state" && message.type !== "error") return;
      cleanup();
      resolve();
    };
    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`world worker exited (${code})`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.off("message", onMessage);
      worker.off("exit", onExit);
    };
    worker.on("message", onMessage);
    worker.on("exit", onExit);
  });
}

async function spawn(doc: Doc): Promise<void> {
  await killWorker(doc);
  const worker = new Worker(worldWorkerEntry());
  liveWorkers.add(worker);
  doc.worker = worker;
  doc.generation += 1;
  resetSerial(doc);
  const generation = doc.generation;
  listen(doc, worker);
  const pending = waitForResult(worker, generation);
  worker.postMessage({
    type: "load",
    project: doc.project,
    world: doc.world,
    generation,
  } satisfies ToWorker);
  tie(doc);
  try {
    await pending;
  } catch (err: unknown) {
    // `error`/`exit` already told subscribers. Don't broadcast a second time.
    if (!doc.worker && doc.errorMessage) return;
    await killWorker(doc);
    const message = err instanceof Error ? err.message : String(err);
    doc.errors = [];
    doc.errorMessage = message;
    doc.lastState = null;
    broadcast(doc, { type: "error", errors: [], message });
    return;
  }
  if (doc.errors && doc.errors.length > 0) await killWorker(doc);
}

async function reload(doc: Doc): Promise<void> {
  const worker = doc.worker;
  if (!worker) {
    await spawn(doc);
    return;
  }
  doc.generation += 1;
  resetSerial(doc);
  const generation = doc.generation;
  const pending = waitForResult(worker, generation);
  worker.postMessage({ type: "reload", generation } satisfies ToWorker);
  try {
    await pending;
  } catch (err: unknown) {
    if (!doc.worker && doc.errorMessage) return;
    await killWorker(doc);
    const message = err instanceof Error ? err.message : String(err);
    doc.errors = [];
    doc.errorMessage = message;
    broadcast(doc, { type: "error", errors: [], message });
    return;
  }
  if (doc.errors && doc.errors.length > 0) await killWorker(doc);
}

/**
 * Validation runs in the worker, which owns the file read. A failed
 * validation still resolves: subscribers get the error event, and no
 * sim is left playing. `change` announces `reloaded` either way, because
 * the previous run is no longer the one on disk.
 */
async function load(doc: Doc, reason: "attach" | "change"): Promise<void> {
  const before = doc.stamp;
  refreshDeps(doc);
  if (reason === "change" && doc.stamp === before) return;
  if (reason === "change") {
    doc.lastCommand = null;
    doc.errorMessage = undefined;
    broadcast(doc, { type: "reloaded" });
  }
  if (!doc.worker) await spawn(doc);
  else await reload(doc);
  refreshDeps(doc);
  refreshFirmware(doc);
  doc.ready = true;
}

function refreshFirmware(doc: Doc) {
  doc.firmware = firmwareWatch(doc.project, doc.world);
}

function startLoad(doc: Doc, reason: "attach" | "change"): Promise<void> {
  if (doc.busy) {
    return doc.busy.then(() => {
      if (!docs.has(doc.key)) return;
      // Queued attach is "change": same files must not reload the run just built.
      return startLoad(doc, reason === "attach" ? "change" : reason);
    });
  }
  // Set busy before load() so a file-watch callback that runs during the
  // first synchronous read cannot start a second load on top of this one.
  let done: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    done = resolve;
  });
  doc.busy = gate;
  return load(doc, reason).finally(() => {
    if (doc.busy === gate) doc.busy = null;
    done();
  });
}

function onWatched(doc: Doc) {
  setImmediate(() => {
    if (!docs.has(doc.key)) return;
    if (doc.busy) {
      void doc.busy.then(() => {
        if (docs.has(doc.key)) onWatched(doc);
      });
      return;
    }
    const stamp = dependencyStamp(doc.project, doc.deps);
    if (stamp !== doc.stamp) {
      void startLoad(doc, "change");
      return;
    }
    const next = firmwareWatch(doc.project, doc.world);
    const changed = next.filter((item) => {
      const prev = doc.firmware.find((row) => row.id === item.id);
      return !prev || prev.rel !== item.rel || prev.stamp !== item.stamp;
    });
    doc.firmware = next;
    if (changed.length === 0) return;
    if (!doc.worker || (doc.errors && doc.errors.length > 0)) return;
    for (const item of changed) {
      post(doc, {
        type: "reloadBoard",
        board: item.id,
        generation: doc.generation,
      });
    }
  });
}

function watch(doc: Doc) {
  if (doc.unwatch) return;
  doc.unwatch = subscribeRootWatch(doc.project, () => onWatched(doc));
}

function post(doc: Doc, message: ToWorker) {
  if (!doc.worker) return;
  if (doc.errors && doc.errors.length > 0) return;
  doc.worker.postMessage(message);
}

function ensure(project: string, worldRel: string): Doc | { error: string } {
  const named = docKey(project, worldRel);
  if ("error" in named) return named;
  let doc = docs.get(named.key);
  if (!doc) {
    doc = {
      key: named.key,
      project: named.project,
      world: named.world,
      subs: new Set(),
      worker: null,
      generation: 0,
      lastState: null,
      lastCommand: null,
      errors: null,
      ready: false,
      busy: null,
      idle: null,
      unwatch: null,
      deps: dependencyRels(named.project, named.world),
      stamp: "",
      firmware: firmwareWatch(named.project, named.world),
      serial: new Map(),
      rx: new Map(),
      stopping: false,
    };
    doc.stamp = dependencyStamp(doc.project, doc.deps);
    docs.set(named.key, doc);
    watch(doc);
  }
  if (doc.idle) {
    clearTimeout(doc.idle);
    doc.idle = null;
  }
  return doc;
}

export async function attachWorld(
  project: string,
  worldRel: string,
  subscription: WorldSubscription
): Promise<WorldHandle | { error: string }> {
  const found = ensure(project, worldRel);
  if ("error" in found) return found;
  const doc = found;
  const sub: Sub = { ...subscription, delivered: false, detached: false };
  doc.subs.add(sub);
  tie(doc);
  // A failed thread leaves `ready` set and the worker cleared. Attach again
  // to rebuild; a file change does the same through the watcher.
  if (!doc.ready || !doc.worker) await startLoad(doc, "attach");
  if (!sub.detached && !sub.delivered) sendSnapshot(sub, doc);

  const handle: WorldHandle = {
    play(nonce?: string) {
      if (sub.detached || !doc.worker) return;
      if (doc.errors && doc.errors.length > 0) return;
      announce(doc, "play", sub.sender, nonce);
      post(doc, { type: "play", generation: doc.generation });
    },
    pause(nonce?: string) {
      if (sub.detached || !doc.worker) return;
      if (doc.errors && doc.errors.length > 0) return;
      announce(doc, "pause", sub.sender, nonce);
      post(doc, { type: "pause", generation: doc.generation });
    },
    step(n: number) {
      if (sub.detached || !doc.worker) return;
      if (doc.errors && doc.errors.length > 0) return;
      if (doc.lastState?.playing) {
        announce(doc, "pause", sub.sender);
        doc.lastState = { ...doc.lastState, playing: false };
      }
      post(doc, { type: "step", n, generation: doc.generation });
    },
    sendSerial(board: string, text: string, nonce?: string) {
      if (sub.detached) return { error: "world is not running" };
      return deliverSerial(doc, sub.sender, board, text, nonce);
    },
    detach() {
      if (sub.detached) return;
      sub.detached = true;
      doc.subs.delete(sub);
      tie(doc);
      armIdle(doc);
    },
  };
  return handle;
}

const BOARD_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

function rejectSerial(
  doc: Doc,
  board: string,
  message: string,
  nonce?: string
): { error: string } {
  broadcast(doc, {
    type: "board-error",
    board,
    message,
    ...(nonce ? { nonce } : {}),
  });
  return { error: message };
}

function deliverSerial(
  doc: Doc,
  sender: WorldSender,
  board: string,
  text: string,
  nonce?: string
): { ok: true } | { error: string } {
  const reject = (message: string) => rejectSerial(doc, board, message, nonce);
  if (!doc.worker || !doc.lastState) return reject("world is not running");
  if (doc.errors && doc.errors.length > 0) {
    return reject(doc.errorMessage ?? "world failed to load");
  }
  if (!BOARD_ID.test(board)) return reject("serial needs a board id");
  if (text.length > SERIAL_TEXT_MAX) {
    return reject(`serial text is longer than ${SERIAL_TEXT_MAX} characters`);
  }
  if (text.length === 0) return reject("serial text is empty");
  const info = doc.lastState.boards[board];
  if (!info) return reject(`no board "${board}"`);
  if (!info.running) {
    const why = info.fault ? `: ${info.fault}` : "";
    return reject(`board "${board}" is stopped${why}`);
  }
  post(doc, {
    type: "serialIn",
    board,
    text,
    generation: doc.generation,
  });
  broadcast(doc, {
    type: "serial-sent",
    board,
    text,
    by: sender,
    ...(nonce ? { nonce } : {}),
  });
  return { ok: true };
}

/**
 * Load the document if nobody has it open yet. Leaves play state alone:
 * a new run starts paused, and a run that is already playing stays playing.
 */
export async function ensureWorldRun(
  project: string,
  worldRel: string
): Promise<{ ok: true } | { error: string }> {
  const found = ensure(project, worldRel);
  if ("error" in found) return found;
  const doc = found;
  if (doc.busy) await doc.busy;
  if (!doc.ready || !doc.worker) await startLoad(doc, "attach");
  if (doc.errors && doc.errors.length > 0) {
    return {
      error:
        doc.errorMessage ?? doc.errors[0]?.message ?? "world failed to load",
    };
  }
  if (!doc.worker || !doc.lastState) return { error: "world did not start" };
  if (doc.subs.size === 0) armIdle(doc);
  return { ok: true };
}

export function readSerial(
  project: string,
  worldRel: string,
  board: string,
  from = 0
): SerialPage | { error: string } {
  const named = docKey(project, worldRel);
  if ("error" in named) return named;
  const doc = docs.get(named.key);
  if (!doc?.worker || !doc.lastState) return { error: "world is not running" };
  if (!doc.lastState.boards[board]) return { error: `no board "${board}"` };
  const ring = doc.serial.get(board);
  if (!ring) return { text: "", next: 0 };
  return ring.read(from);
}

export function sendSerial(
  project: string,
  worldRel: string,
  board: string,
  text: string,
  sender: WorldSender,
  nonce?: string
): { ok: true } | { error: string } {
  const named = docKey(project, worldRel);
  if ("error" in named) return named;
  const doc = docs.get(named.key);
  if (!doc) return { error: "world is not running" };
  return deliverSerial(doc, sender, board, text, nonce);
}

/** Test-only. Bytes waiting on USART0 RX, and how many have been accepted. */
export function boardRx(
  project: string,
  worldRel: string,
  board: string
): { queued: number; accepted: number } | { error: string } {
  const named = docKey(project, worldRel);
  if ("error" in named) return named;
  const doc = docs.get(named.key);
  if (!doc?.lastState) return { error: "world is not running" };
  if (!doc.lastState.boards[board]) return { error: `no board "${board}"` };
  return doc.rx.get(board) ?? { queued: 0, accepted: 0 };
}

/** Test-only. The next `step` on this document throws inside the worker. */
export function faultWorld(project: string, worldRel: string): void {
  const named = docKey(project, worldRel);
  if ("error" in named) return;
  const doc = docs.get(named.key);
  if (!doc?.worker) return;
  doc.worker.postMessage({
    type: "fault",
    generation: doc.generation,
  } satisfies ToWorker);
}

export async function stopWorld(
  project: string,
  worldRel: string
): Promise<void> {
  const named = docKey(project, worldRel);
  if ("error" in named) return;
  await stopKey(named.key);
}

async function stopKey(key: string): Promise<void> {
  const doc = docs.get(key);
  if (!doc) return;
  docs.delete(key);
  if (doc.idle) clearTimeout(doc.idle);
  doc.unwatch?.();
  doc.unwatch = null;
  for (const sub of doc.subs) sub.detached = true;
  doc.subs.clear();
  await killWorker(doc);
}
