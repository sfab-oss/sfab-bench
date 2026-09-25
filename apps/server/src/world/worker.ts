import { parentPort } from "node:worker_threads";

import {
  arduinoPinBit,
  partModel,
  type WorldDocument,
  type WorldError,
  type WorldPartState,
  type WorldState,
} from "@sfab-bench/contract";

import { AvrBoard, FIRMWARE_RELOADED } from "./board";
import { projectReal, readerFor, readInside, type WorldBytes } from "./files";
import { parseIntelHex } from "./ihex";
import {
  type CompiledWorld,
  compileWorld,
  type WorldModelCounts,
} from "./model";
import { blankTrack, type ServoTrack, trackServo } from "./servo";
import { servoSignalDrives } from "./wiring";

/**
 * One world, off the API thread. The host starts one of these per open
 * document. Sim time advances only in here: `step(n)` is exactly n steps
 * of 1 ms, and `play` batches steps so sim time tracks wall time at 1×.
 */

const TICK_MS = 16;
const STATE_EVERY_MS = 1000 / 30;
const MAX_STEPS_PER_TICK = 100;
// Lockstep AVR runs about 4x real time, so one step call stays in seconds.
const MAX_STEP_N = 60_000;

export type ToWorker =
  | { type: "load"; project: string; world: string; generation: number }
  | { type: "reload"; generation: number }
  | { type: "play"; generation: number }
  | { type: "pause"; generation: number }
  | { type: "step"; n: number; generation: number }
  | { type: "setTarget"; partId: string; radians: number; generation: number }
  | { type: "reloadBoard"; board: string; generation: number }
  | { type: "serialIn"; board: string; text: string; generation: number }
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
    }
  | {
      type: "serial";
      generation: number;
      chunks: { board: string; text: string }[];
    }
  | { type: "boardReset"; generation: number; board: string; marker: string }
  | { type: "boardFault"; generation: number; board: string; message: string }
  | {
      type: "rx";
      generation: number;
      board: string;
      queued: number;
      accepted: number;
    };

type Sim = CompiledWorld & {
  data: InstanceType<CompiledWorld["mj"]["MjData"]>;
};

const port = parentPort;
type BoardSpec = { id: string; chip: string; firmware: string };

let generation = 0;
let project = "";
let worldRel = "";
let sim: Sim | null = null;
let files: WorldBytes | null = null;
let specs: BoardSpec[] = [];
let boards: AvrBoard[] = [];

type LiveServo = {
  partId: string;
  boardId: string;
  pinBit: number;
  actuatorId: number;
  jointName: string;
  speedRadPerSec: number;
  torqueNm: number;
  track: ServoTrack;
};

let liveServos: LiveServo[] = [];
const faulted = new Set<string>();
const rxSent = new Map<string, string>();
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
  const boardState: WorldState["boards"] = {};
  for (const board of boards) {
    const pins = board.takePins();
    boardState[board.id] = board.fault
      ? { running: false, fault: board.fault, pins }
      : { running: board.running, pins };
  }
  const parts: Record<string, WorldPartState> = {};
  for (const servo of liveServos) {
    parts[servo.partId] = {
      pulseUs: servo.track.pulseUs,
      commandDeg: servo.track.commandDeg,
    };
  }
  return {
    simTime: data.time,
    playing,
    poses,
    joints,
    boards: boardState,
    parts,
  };
}

function flushBoards() {
  const chunks: { board: string; text: string }[] = [];
  for (const board of boards) {
    const text = board.takeTx();
    if (text) chunks.push({ board: board.id, text });
    const stamp = `${board.rxQueued}:${board.rxAccepted}`;
    if (rxSent.get(board.id) === stamp) continue;
    rxSent.set(board.id, stamp);
    post({
      type: "rx",
      generation,
      board: board.id,
      queued: board.rxQueued,
      accepted: board.rxAccepted,
    });
  }
  if (chunks.length > 0) post({ type: "serial", generation, chunks });
}

function postState() {
  flushBoards();
  const state = sample();
  if (!state) return;
  post({ type: "state", generation, state });
}

function noteFault(board: AvrBoard) {
  if (!board.fault || faulted.has(board.id)) return;
  faulted.add(board.id);
  post({
    type: "boardFault",
    generation,
    board: board.id,
    message: board.fault,
  });
}

function boardSpecsOf(parsed: unknown): BoardSpec[] {
  if (!parsed || typeof parsed !== "object") return [];
  const list = (parsed as { boards?: unknown }).boards;
  if (!Array.isArray(list)) return [];
  const out: BoardSpec[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; chip?: unknown; firmware?: unknown };
    if (
      typeof row.id !== "string" ||
      typeof row.chip !== "string" ||
      typeof row.firmware !== "string"
    ) {
      continue;
    }
    out.push({ id: row.id, chip: row.chip, firmware: row.firmware });
  }
  return out;
}

function bootBoard(spec: BoardSpec): AvrBoard {
  const board = new AvrBoard(spec.id);
  if (spec.chip !== "atmega328p") {
    board.stop(`unsupported chip "${spec.chip}"`);
    return board;
  }
  const bytes = files?.read(spec.firmware);
  if (!bytes) {
    board.stop(`firmware "${spec.firmware}" does not exist`);
    return board;
  }
  const parsed = parseIntelHex(new TextDecoder().decode(bytes));
  if (!parsed.ok) {
    board.stop(parsed.error);
    return board;
  }
  board.load(parsed.bytes);
  return board;
}

function loadBoards(parsed: unknown) {
  specs = boardSpecsOf(parsed);
  boards = specs.map((spec) => bootBoard(spec));
  faulted.clear();
  rxSent.clear();
  for (const board of boards) noteFault(board);
}

function setActuatorTorque(id: number, torque: number) {
  if (!sim) return;
  const range = sim.model.actuator_forcerange as Float64Array;
  const base = id * 2;
  range[base] = -torque;
  range[base + 1] = torque;
}

/**
 * Wire each servo signal to its board pin and start it limp. Speed and
 * torque are the part-model numbers at V = V_nom. W4b scales both.
 */
function bindServos(doc: WorldDocument) {
  liveServos = [];
  if (!sim) return;
  for (const drive of servoSignalDrives(doc)) {
    const bit = arduinoPinBit(drive.pin);
    const actuatorId = sim.index.parts[drive.partId];
    const part = doc.parts.find((item) => item.id === drive.partId);
    const model = part ? partModel(part.model) : undefined;
    const speed = model?.speedDegPerSec;
    const torque = model?.torqueNm;
    if (
      bit === undefined ||
      actuatorId === undefined ||
      !part?.drives ||
      speed === undefined ||
      torque === undefined
    ) {
      continue;
    }
    const board = boards.find((item) => item.id === drive.boardId);
    board?.watchEdge(bit);
    // Limp until the first valid pulse, including before the first step.
    setActuatorTorque(actuatorId, 0);
    liveServos.push({
      partId: drive.partId,
      boardId: drive.boardId,
      pinBit: bit,
      actuatorId,
      jointName: `${part.drives.robot}/${part.drives.joint}`,
      speedRadPerSec: (speed * Math.PI) / 180,
      torqueNm: torque,
      track: blankTrack(),
    });
  }
}

function rearmServos(boardId: string, board: AvrBoard) {
  for (const servo of liveServos) {
    if (servo.boardId !== boardId) continue;
    board.watchEdge(servo.pinBit);
    servo.track = blankTrack();
    setActuatorTorque(servo.actuatorId, 0);
  }
}

function reloadBoard(id: string) {
  const spec = specs.find((item) => item.id === id);
  if (!spec) {
    post({
      type: "boardFault",
      generation,
      board: id,
      message: `no board "${id}"`,
    });
    return;
  }
  const next = bootBoard(spec);
  const index = boards.findIndex((item) => item.id === id);
  if (index >= 0) boards[index] = next;
  else boards.push(next);
  rearmServos(id, next);
  rxSent.delete(id);
  faulted.delete(id);
  if (next.running) {
    post({
      type: "boardReset",
      generation,
      board: id,
      marker: FIRMWARE_RELOADED,
    });
  } else {
    noteFault(next);
  }
  postState();
}

function serialIn(id: string, text: string) {
  const board = boards.find((item) => item.id === id);
  if (!board?.running) return;
  if (!board.pushRx(text)) {
    rxSent.set(id, `${board.rxQueued}:${board.rxAccepted}`);
    post({
      type: "rx",
      generation,
      board: id,
      queued: board.rxQueued,
      accepted: board.rxAccepted,
    });
    return;
  }
  rxSent.set(id, `${board.rxQueued}:${board.rxAccepted}`);
  post({
    type: "rx",
    generation,
    board: id,
    queued: board.rxQueued,
    accepted: board.rxAccepted,
  });
}

/** Apply this millisecond's pulses, then one MuJoCo step. */
function applyServos() {
  if (!sim) return;
  const simTime = sim.data.time;
  const pulses = new Map<string, { bit: number; us: number }[]>();
  for (const board of boards) pulses.set(board.id, board.takePulses());
  for (const servo of liveServos) {
    const widths = (pulses.get(servo.boardId) ?? [])
      .filter((pulse) => pulse.bit === servo.pinBit)
      .map((pulse) => pulse.us);
    const qpos = scalar(sim.data.jnt(servo.jointName).qpos as Float64Array);
    const stepped = trackServo({
      track: servo.track,
      simTime,
      pulsesUs: widths,
      qpos,
      speedRadPerSec: servo.speedRadPerSec,
    });
    servo.track = stepped.track;
    setActuatorTorque(servo.actuatorId, stepped.limp ? 0 : servo.torqueNm);
    if (!stepped.limp && stepped.ctrl !== null) {
      sim.data.actuator(servo.partId).ctrl = stepped.ctrl;
    }
  }
}

/** One millisecond: every live board, then one MuJoCo step. */
function advanceOne() {
  if (!sim) return;
  if (throwOnStep) {
    throwOnStep = false;
    throw new Error("injected step fault");
  }
  for (const board of boards) {
    if (!board.running) continue;
    try {
      board.stepMillis();
    } catch (err: unknown) {
      board.stop(thrownMessage(err));
    }
    noteFault(board);
  }
  applyServos();
  sim.mj.mj_step(sim.model, sim.data);
}

function dispose() {
  playing = false;
  throwOnStep = false;
  boards = [];
  liveServos = [];
  specs = [];
  files = null;
  faulted.clear();
  rxSent.clear();
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
  const bytesReader = readerFor(root, worldRel);
  const compiled = await compileWorld(parsed, bytesReader);
  if (!compiled.ok) {
    fail(compiled.errors);
    return false;
  }
  const data = new compiled.mj.MjData(compiled.model);
  compiled.mj.mj_forward(compiled.model, data);
  sim = { ...compiled, data };
  files = bytesReader;
  playing = false;
  loadBoards(parsed);
  bindServos(parsed as WorldDocument);
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
    for (let i = 0; i < steps; i++) advanceOne();
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
  for (let i = 0; i < n; i++) advanceOne();
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
  else if (message.type === "reloadBoard") reloadBoard(message.board);
  else if (message.type === "serialIn") serialIn(message.board, message.text);
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
