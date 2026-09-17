import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { Done, Job } from "./worker";

/**
 * Compile a STEP into a view package, on a thread that is not the server's.
 *
 * Reading a STEP and tessellating it are long synchronous runs inside wasm — 25
 * seconds for a 26MB assembly — and on the API thread that is 25 seconds in which
 * nothing else is answered: not `/api/me`, not recents, not a paired headset's
 * websocket. Moving it to a worker buys three things at once:
 *
 * - the server stays responsive while a model builds
 * - a file that sends the mesher into a pathological loop can be killed, instead
 *   of wedging the process for good
 * - the wasm heap, which only ever grows, goes back to the OS when the thread
 *   ends, so recycling is just "start a new worker" rather than a careful dance
 *   with a kernel other code still holds pointers into
 */

/** One job at a time: the kernel behind the worker is a single wasm instance. */
let queue: Promise<unknown> = Promise.resolve();
let worker: Worker | null = null;
let nextId = 1;

/** Whatever job the worker is running, so a crash can be reported to its caller. */
let inFlight: { id: number; settle: (done: Done) => void } | null = null;

/**
 * A wasm heap never shrinks: freed pages go back to emscripten's own allocator,
 * not the OS, and OCCT fragments what it gets. Six opens of a 26MB assembly settle
 * around 860MB. The ceiling is a hard 2GB, past which every call throws and the
 * instance is dead — so above this mark the thread is retired and the next job
 * gets a new one, for about 350ms.
 */
const RETIRE_ABOVE_BYTES = 1280 * 1024 * 1024;

/**
 * Long enough that no real file hits it — the largest thing we have takes 25s —
 * and short enough that a pathological one does not hold a slot forever.
 */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Bundled, the worker is emitted beside the server bundle. From a checkout it is
 * the TypeScript file next to this one, which `tsx` loads in the worker too.
 */
function workerEntry(): string {
  for (const rel of ["./occt-worker.mjs", "./worker.ts"]) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "the tessellation worker is missing beside the server bundle"
  );
}

function spawn(): Worker {
  const started = new Worker(workerEntry());
  started.on("message", (done: Done) => inFlight?.settle(done));
  started.on("error", (err) =>
    inFlight?.settle({
      id: inFlight.id,
      ok: false,
      error: `tessellation thread failed: ${err.message}`,
    })
  );
  started.on("exit", (code) => {
    if (worker === started) worker = null;
    inFlight?.settle({
      id: inFlight.id,
      ok: false,
      error: `tessellation thread exited (${code})`,
    });
  });
  // Idle, it must not hold the process open; see `run` for the ref during a job.
  started.unref();
  return started;
}

async function retire(): Promise<void> {
  const going = worker;
  worker = null;
  if (going) await going.terminate();
}

async function run(stepAbs: string, dest: string): Promise<void> {
  if (!worker) worker = spawn();
  const active = worker;
  const id = nextId++;

  let timer: ReturnType<typeof setTimeout>;
  const done = await new Promise<Done>((resolve) => {
    let settled = false;
    const settle = (result: Done) => {
      // Late messages from a thread we already gave up on are not this job's.
      if (settled || result.id !== id) return;
      settled = true;
      clearTimeout(timer);
      inFlight = null;
      active.unref();
      resolve(result);
    };
    inFlight = { id, settle };
    timer = setTimeout(() => {
      void retire();
      settle({
        id,
        ok: false,
        error: `tessellating ${stepAbs} took longer than ${JOB_TIMEOUT_MS}ms`,
      });
    }, JOB_TIMEOUT_MS);
    active.ref();
    active.postMessage({ id, stepAbs, dest } satisfies Job);
  });

  if (!done.ok) {
    // The thread may have written part of a package before it died.
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(done.error);
  }
  if (done.heapBytes >= RETIRE_ABOVE_BYTES) {
    console.log(
      `[occt] worker heap reached ${Math.round(done.heapBytes / 1048576)}MB; retiring it`
    );
    await retire();
  }
}

/** Compile `stepAbs` into a view package at `dest`. Serialised across callers. */
export function buildStepPackage(stepAbs: string, dest: string): Promise<void> {
  const next = () => run(stepAbs, dest);
  const started = queue.then(next, next);
  queue = started.catch(() => undefined);
  return started;
}
