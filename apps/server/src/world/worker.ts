import { parentPort } from "node:worker_threads";

import type { WorldError, WorldState } from "@sfab-bench/contract";

import { projectReal, readerFor, readInside } from "./files";
import {
  type CompiledWorld,
  compileWorld,
  type WorldModelCounts,
} from "./model";

/**
 * One world, off the API thread. The host starts one of these per open
 * document. Sim time advances only in here: `step(n)` is exactly n steps
 * of 1 ms, and `play` batches steps so sim time tracks wall time at 1×.
 */

const TICK_MS = 16;
const STATE_EVERY_MS = 1000 / 30;
const MAX_STEPS_PER_TICK = 100;
const MAX_STEP_N = 1_000_000;

export type ToWorker =
  | { type: "load"; project: string; world: string; generation: number }
  | { type: "reload"; generation: number }
  | { type: "play"; generation: number }
  | { type: "pause"; generation: number }
  | { type: "step"; n: number; generation: number }
  | { type: "setTarget"; partId: string; radians: number; generation: number }
  | { type: "fault"; generation: number }
  | { type: "stop" };

export type FromWorker =
  | { type: "ready"; generation: number; counts: WorldModelCounts }
  | { type: "state"; generation: number; state: WorldState }
  | {
      type: "error";
      generation: number;
      errors: WorldError[];
      message?: string;
    };

type Sim = CompiledWorld & {
  data: InstanceType<CompiledWorld["mj"]["MjData"]>;
};

const port = parentPort;
let generation = 0;
let project = "";
let worldRel = "";
let sim: Sim | null = null;
let playing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWall = 0;
let stepDebt = 0;
let sinceState = 0;
const queue: ToWorker[] = [];
let pumping = false;
/** Test-only. The next `step` throws once, inside the sim loop. */
let throwOnStep = false;

function thrownMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function post(message: FromWorker) {
  port?.postMessage(message);
}

function fail(errors: WorldError[], message?: string) {
  post({ type: "error", generation, errors, ...(message ? { message } : {}) });
}

function countsOf(compiled: CompiledWorld): WorldModelCounts {
  return {
    nbody: compiled.index.nbody,
    njnt: compiled.index.njnt,
    nu: compiled.index.nu,
    nmesh: compiled.index.nmesh,
    bodyNames: compiled.index.bodyNames,
    jointNames: compiled.index.jointNames,
    actuatorNames: compiled.index.actuatorNames,
    meshNames: compiled.index.meshNames,
    geomNames: compiled.index.geomNames,
  };
}

function tuple3(value: Float64Array): [number, number, number] {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

function tuple4(value: Float64Array): [number, number, number, number] {
  return [value[0] ?? 1, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0];
}

function scalar(value: Float64Array): number {
  return value[0] ?? 0;
}

function sample(): WorldState | null {
  if (!sim) return null;
  const { mj, model, data, index } = sim;
  mj.mj_forward(model, data);
  const poses: WorldState["poses"] = {};
  for (const [robotId, links] of Object.entries(index.linkNames)) {
    const robot: WorldState["poses"][string] = {};
    for (const [link, mjName] of Object.entries(links)) {
      const body = data.body(mjName);
      robot[link] = {
        p: tuple3(body.xpos as Float64Array),
        q: tuple4(body.xquat as Float64Array),
      };
    }
    poses[robotId] = robot;
  }
  const joints: WorldState["joints"] = {};
  for (const [robotId, names] of Object.entries(index.jointNamesByRobot)) {
    const robot: WorldState["joints"][string] = {};
    for (const [joint, mjName] of Object.entries(names)) {
      robot[joint] = scalar(data.jnt(mjName).qpos as Float64Array);
    }
    joints[robotId] = robot;
  }
  return { simTime: data.time, playing, poses, joints };
}

function postState() {
  const state = sample();
  if (!state) return;
  post({ type: "state", generation, state });
}

function dispose() {
  playing = false;
  throwOnStep = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!sim) return;
  const going = sim;
  sim = null;
  try {
    going.data.delete();
  } catch {
    /* already gone */
  }
  try {
    going.model.delete();
  } catch {
    /* already gone */
  }
  try {
    going.vfs.delete();
  } catch {
    /* already gone */
  }
}

async function build(): Promise<boolean> {
  dispose();
  const root = projectReal(project);
  if (!root) {
    fail([
      {
        code: "missing-file",
        path: "",
        message: "The project folder is gone. Hint: open the folder again.",
      },
    ]);
    return false;
  }
  const bytes = readInside(root, worldRel);
  if (!bytes) {
    fail([
      {
        code: "missing-file",
        path: "",
        message: `World "${worldRel}" does not exist. Hint: the path is relative to the project.`,
      },
    ]);
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    fail([
      {
        code: "schema",
        path: "",
        message: "World file is not JSON. Hint: a world is <name>.world.json.",
      },
    ]);
    return false;
  }
  const compiled = await compileWorld(parsed, readerFor(root, worldRel));
  if (!compiled.ok) {
    fail(compiled.errors);
    return false;
  }
  const data = new compiled.mj.MjData(compiled.model);
  compiled.mj.mj_forward(compiled.model, data);
  sim = { ...compiled, data };
  playing = false;
  post({ type: "ready", generation, counts: countsOf(compiled) });
  postState();
  return true;
}

function stopClock() {
  playing = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  stepDebt = 0;
}

function onTick() {
  timer = null;
  if (!playing || !sim) return;
  try {
    const now = performance.now();
    const elapsed = now - lastWall;
    lastWall = now;
    stepDebt += elapsed;
    let steps = Math.floor(stepDebt);
    stepDebt -= steps;
    if (steps > MAX_STEPS_PER_TICK) {
      steps = MAX_STEPS_PER_TICK;
      stepDebt = 0;
    }
    for (let i = 0; i < steps; i++) sim.mj.mj_step(sim.model, sim.data);
    sinceState += elapsed;
    if (sinceState >= STATE_EVERY_MS) {
      sinceState = 0;
      postState();
    }
    if (playing) arm();
  } catch (err: unknown) {
    // A MuJoCo throw must not escape the timer: that kills the API process.
    stopClock();
    fail([], thrownMessage(err));
    try {
      postState();
    } catch {
      /* the error event is the one the host needs */
    }
  }
}

function arm() {
  if (timer) return;
  timer = setTimeout(onTick, TICK_MS);
}

function play() {
  if (!sim) return;
  playing = true;
  lastWall = performance.now();
  stepDebt = 0;
  sinceState = 0;
  arm();
  postState();
}

function pause() {
  if (!sim) return;
  stopClock();
  postState();
}

function step(n: number) {
  if (!sim) return;
  if (!Number.isInteger(n) || n < 0 || n > MAX_STEP_N) {
    fail(
      [],
      `step(${String(n)}) is not a whole number of steps from 0 to ${MAX_STEP_N}.`
    );
    return;
  }
  // A step is exact. Stop the wall clock first so the two do not add.
  stopClock();
  for (let i = 0; i < n; i++) {
    if (throwOnStep) {
      throwOnStep = false;
      throw new Error("injected step fault");
    }
    sim.mj.mj_step(sim.model, sim.data);
  }
  postState();
}

function setTarget(partId: string, radians: number) {
  if (!sim) return;
  if (!Number.isFinite(radians)) {
    fail([], `target for "${partId}" is not a finite angle.`);
    return;
  }
  const id = sim.index.parts[partId];
  if (id === undefined) {
    fail([], `no actuator for part "${partId}".`);
    return;
  }
  sim.data.actuator(partId).ctrl = radians;
}

async function handle(message: ToWorker) {
  if (message.type === "stop") {
    stopClock();
    dispose();
    return;
  }
  if (message.generation !== generation && message.type !== "load") {
    if (message.generation < generation) return;
  }
  if (message.type === "load") {
    generation = message.generation;
    project = message.project;
    worldRel = message.world;
    await build();
    return;
  }
  generation = message.generation;
  if (message.type === "reload") {
    stopClock();
    await build();
    return;
  }
  if (message.type === "play") play();
  else if (message.type === "pause") pause();
  else if (message.type === "step") step(message.n);
  else if (message.type === "setTarget")
    setTarget(message.partId, message.radians);
  else if (message.type === "fault") throwOnStep = true;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const message = queue.shift();
      if (!message) break;
      await handle(message);
    }
  } catch (err: unknown) {
    stopClock();
    fail([], thrownMessage(err));
    try {
      postState();
    } catch {
      /* already reported */
    }
  } finally {
    pumping = false;
  }
  // The message that threw was already shifted off. Keep going so a later
  // step or pause queued behind it is not dropped. A second throw is caught
  // on the next pump.
  if (queue.length > 0) void pump();
}

if (port) {
  port.on("message", (message: ToWorker) => {
    queue.push(message);
    void pump();
  });
}
