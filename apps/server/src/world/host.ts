import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type {
  WorldError,
  WorldSender,
  WorldServerMessage,
  WorldState,
} from "@sfab-bench/contract";

import { subscribeRootWatch } from "../projects";
import { dependencyRels, dependencyStamp, projectReal } from "./files";
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
  play: () => void;
  pause: () => void;
  step: (n: number) => void;
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
  errors: WorldError[] | null;
  errorMessage?: string;
  ready: boolean;
  busy: Promise<void> | null;
  idle: ReturnType<typeof setTimeout> | null;
  unwatch: (() => void) | null;
  deps: string[];
  stamp: string;
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
  if (
    !world ||
    world.split("/").includes("..") ||
    !world.toLowerCase().endsWith(".world.json")
  ) {
    return { error: "not a world document" };
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

function sendSnapshot(sub: Sub, doc: Doc) {
  const event = snapshot(doc);
  if (!event) return;
  sub.delivered = true;
  sub.onEvent(structuredClone(event));
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

function listen(doc: Doc, worker: Worker) {
  worker.on("message", (message: FromWorker) => {
    if (message.generation !== doc.generation) return;
    if (message.type === "state") {
      doc.lastState = message.state;
      doc.errors = null;
      doc.errorMessage = undefined;
      broadcast(doc, { type: "state", state: message.state });
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
  worker.on("exit", () => {
    liveWorkers.delete(worker);
    if (doc.worker !== worker) return;
    doc.worker = null;
    if (doc.stopping) return;
    const message = "world worker exited";
    doc.errors = [];
    doc.errorMessage = message;
    doc.lastState = null;
    broadcast(doc, { type: "error", errors: [], message });
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
  const generation = doc.generation;
  const pending = waitForResult(worker, generation);
  worker.postMessage({ type: "reload", generation } satisfies ToWorker);
  try {
    await pending;
  } catch (err: unknown) {
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
  if (reason === "change") broadcast(doc, { type: "reloaded" });
  if (!doc.worker) await spawn(doc);
  else await reload(doc);
  refreshDeps(doc);
  doc.ready = true;
}

function startLoad(doc: Doc, reason: "attach" | "change"): Promise<void> {
  if (doc.busy) {
    return doc.busy.then(() => {
      if (!docs.has(doc.key)) return;
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
    const stamp = dependencyStamp(doc.project, doc.deps);
    if (stamp === doc.stamp) return;
    void startLoad(doc, "change");
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
      errors: null,
      ready: false,
      busy: null,
      idle: null,
      unwatch: null,
      deps: dependencyRels(named.project, named.world),
      stamp: "",
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
  if (!doc.ready) await startLoad(doc, "attach");
  if (!sub.detached && !sub.delivered) sendSnapshot(sub, doc);

  const handle: WorldHandle = {
    play() {
      if (sub.detached || !doc.worker) return;
      if (doc.errors && doc.errors.length > 0) return;
      broadcast(doc, { type: "command", command: "play", by: sub.sender });
      post(doc, { type: "play", generation: doc.generation });
    },
    pause() {
      if (sub.detached || !doc.worker) return;
      if (doc.errors && doc.errors.length > 0) return;
      broadcast(doc, { type: "command", command: "pause", by: sub.sender });
      post(doc, { type: "pause", generation: doc.generation });
    },
    step(n: number) {
      if (sub.detached || !doc.worker) return;
      post(doc, { type: "step", n, generation: doc.generation });
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
