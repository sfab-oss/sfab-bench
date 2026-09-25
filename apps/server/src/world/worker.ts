import { parentPort } from "node:worker_threads";

import {
  arduinoPinBit,
  boardModel,
  chipModel,
  partModel,
  RECORD_FRAME_MS,
  type RecordedFrame,
  type RecordingInfo,
  type RecordingRead,
  type TimelineMarker,
  type TimelineTrack,
  type WorldDocument,
  type WorldError,
  type WorldPartMotion,
  type WorldPartState,
  type WorldSender,
  type WorldState,
  type WorldSupplyState,
} from "@sfab-bench/contract";

import { AvrBoard, FIRMWARE_RELOADED } from "./board";
import { projectReal, readerFor, readInside, type WorldBytes } from "./files";
import { parseIntelHex } from "./ihex";
import {
  type CompiledWorld,
  compileWorld,
  type WorldModelCounts,
} from "./model";
import { scaleWithVoltage, stepPartMotion, supplyVoltage } from "./power";
import { motionRank, RunRecorder, timelineFromRead } from "./record";
import { blankTrack, type ServoTrack, trackServo } from "./servo";
import { type PowerFeeds, powerFeeds, servoSignalDrives } from "./wiring";

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

export type RecordQuery =
  | { op: "info" }
  | {
      op: "read";
      from: number;
      to: number;
      tracks?: string[];
      maxFrames?: number;
    }
  | { op: "frame"; t: number }
  | { op: "timeline"; from: number; to: number; maxPoints: number }
  | { op: "config"; boundMs?: number; enabled?: boolean };

export type RecordBody =
  | { op: "info"; info: RecordingInfo }
  | { op: "read"; read: RecordingRead }
  | { op: "frame"; id: string; frame: RecordedFrame | null }
  | {
      op: "timeline";
      id: string;
      from: number;
      to: number;
      tracks: TimelineTrack[];
      markers: TimelineMarker[];
    }
  | { op: "ack" }
  | { op: "error"; message: string };

export type ToWorker =
  | { type: "load"; project: string; world: string; generation: number }
  | { type: "reload"; generation: number }
  | { type: "play"; generation: number; by?: WorldSender }
  | { type: "pause"; generation: number; by?: WorldSender }
  | { type: "step"; n: number; generation: number; pauseBy?: WorldSender }
  | { type: "setTarget"; partId: string; radians: number; generation: number }
  | { type: "reloadBoard"; board: string; generation: number }
  | {
      type: "serialIn";
      board: string;
      text: string;
      generation: number;
      by?: WorldSender;
    }
  | { type: "fault"; generation: number }
  | {
      type: "record";
      generation: number;
      request: number;
      query: RecordQuery;
    }
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
  | { type: "brownoutBoot"; generation: number; board: string }
  | { type: "boardFault"; generation: number; board: string; message: string }
  | {
      type: "rx";
      generation: number;
      board: string;
      queued: number;
      accepted: number;
    }
  | {
      type: "record";
      generation: number;
      request: number;
      body: RecordBody;
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

type ServoDrive = {
  /** The live CPU. Replaced when that board's firmware reloads. */
  board: AvrBoard;
  pinBit: number;
  actuatorId: number;
  jointName: string;
  speedRadPerSec: number;
  torqueNm: number;
  /** Part-model `supply.nominal`. Speed and torque scale by V / this. */
  nominalVoltage: number;
  scale: boolean;
  track: ServoTrack;
  /** Setpoint has not reached the command after the latest track step. */
  slewing: boolean;
};

type Load = {
  partId: string;
  supplyId: string | null;
  idleCurrent: number;
  movingCurrent: number;
  stallCurrent: number;
  stall: {
    minAngleErrorDeg: number;
    maxVelocityDegPerSec: number;
    holdMs: number;
  } | null;
  state: WorldPartMotion;
  holdMs: number;
  /** Amperes classified last step. The next voltage uses this. */
  current: number;
  drive: ServoDrive | null;
};

type BoardPower = {
  supplyId: string | null;
  /** Catalog amperes while a supply is connected, including during brownout. */
  draw: number;
  brownoutVoltage: number;
  resets: number;
};

type SupplySpec = {
  id: string;
  voltage: number;
  currentLimit: number;
  rDroop: number;
};

let loads: Load[] = [];
let boardPower = new Map<string, BoardPower>();
let supplySpecs: SupplySpec[] = [];
let partFeeds: PowerFeeds["parts"] = {};
/**
 * Voltage and current used for the step in progress. Filled from the
 * previous step's part states before the CPUs and the joint move.
 */
let supplyLive: Record<string, WorldSupplyState> = {};
/** Reused each step. Cleared at the start of the voltage and pulse passes. */
const stepDraw = new Map<string, number>();
const stepPulses = new Map<string, { bit: number; us: number }[]>();
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

let recorder: RunRecorder | null = null;
let recordingSeq = 0;
const txSeen = new Map<string, number>();
const pendingNotes: { kind: "reset" | "reboot"; board: string }[] = [];

type RecLayout = {
  joints: { robot: string; joint: string; mj: string }[];
  bodies: { robot: string; link: string; mj: string }[];
  parts: Load[];
  supplies: SupplySpec[];
  boards: string[];
};

let layout: RecLayout | null = null;

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
    const power = boardPower.get(board.id);
    const unpowered = !power?.supplyId;
    boardState[board.id] = {
      ...(board.fault
        ? { running: false as const, fault: board.fault, pins }
        : { running: board.running, pins }),
      ...(unpowered ? { unpowered: true as const } : {}),
      resets: power?.resets ?? 0,
      brownout: board.brownout,
    };
  }
  const parts: Record<string, WorldPartState> = {};
  for (const load of loads) {
    // Only a driven servo is on the wire. An unwired part still draws
    // through `loads` when its V+ has a supply, and stays out of `parts`.
    if (!load.drive) continue;
    parts[load.partId] = {
      pulseUs: load.drive?.track.pulseUs ?? null,
      commandDeg: load.drive?.track.commandDeg ?? null,
      state: load.state,
      current: load.current,
    };
  }
  return {
    simTime: data.time,
    playing,
    poses,
    joints,
    boards: boardState,
    parts,
    supplies: supplyLive,
    ...(recorder ? { recording: recorder.summary(data.time) } : {}),
  };
}

function simMs(): number {
  if (!sim) return 0;
  return Math.round(sim.data.time * 1000);
}

function noteCommand(kind: "play" | "pause", by?: WorldSender) {
  if (!by || !recorder) return;
  recorder.noteEvent({ timeMs: simMs(), kind, by });
}

function fillRecorder(full: boolean) {
  const rec = recorder;
  const lay = layout;
  if (!rec || !lay || !sim) return;
  if (full) {
    for (let i = 0; i < lay.joints.length; i++) {
      const spec = lay.joints[i];
      if (!spec) continue;
      rec.joint[i] = scalar(sim.data.jnt(spec.mj).qpos as Float64Array);
    }
    let pose = 0;
    for (const spec of lay.bodies) {
      const body = sim.data.body(spec.mj);
      const p = body.xpos as Float64Array;
      const q = body.xquat as Float64Array;
      rec.pose[pose] = p[0] ?? 0;
      rec.pose[pose + 1] = p[1] ?? 0;
      rec.pose[pose + 2] = p[2] ?? 0;
      rec.pose[pose + 3] = q[0] ?? 1;
      rec.pose[pose + 4] = q[1] ?? 0;
      rec.pose[pose + 5] = q[2] ?? 0;
      rec.pose[pose + 6] = q[3] ?? 0;
      pose += 7;
    }
    for (let i = 0; i < lay.parts.length; i++) {
      const drive = lay.parts[i]?.drive;
      rec.pulse[i] = drive?.track.pulseUs ?? Number.NaN;
      rec.command[i] = drive?.track.commandDeg ?? Number.NaN;
    }
    for (let i = 0; i < lay.boards.length; i++) {
      const id = lay.boards[i];
      const board = boards.find((item) => item.id === id);
      const pins = board?.peekPins() ?? { ddr: 0, level: 0, toggled: 0 };
      rec.ddr[i] = pins.ddr;
      rec.level[i] = pins.level;
      rec.toggled[i] = pins.toggled;
      rec.running[i] = board?.running ? 1 : 0;
    }
  }
  for (let i = 0; i < lay.parts.length; i++) {
    const load = lay.parts[i];
    if (!load) continue;
    rec.state[i] = motionRank(load.state);
    rec.partCurrent[i] = load.current;
  }
  for (let i = 0; i < lay.supplies.length; i++) {
    const spec = lay.supplies[i];
    const live = spec ? supplyLive[spec.id] : undefined;
    rec.voltage[i] = live?.voltage ?? 0;
    rec.supplyCurrent[i] = live?.current ?? 0;
  }
  for (let i = 0; i < lay.boards.length; i++) {
    const id = lay.boards[i];
    const board = boards.find((item) => item.id === id);
    rec.brownout[i] = board?.brownout ? 1 : 0;
  }
}

function openRecorder() {
  recorder = null;
  layout = null;
  txSeen.clear();
  pendingNotes.length = 0;
  if (!sim) return;
  const joints: RecLayout["joints"] = [];
  for (const [robot, names] of Object.entries(sim.index.jointNamesByRobot)) {
    for (const [joint, mj] of Object.entries(names)) {
      joints.push({ robot, joint, mj });
    }
  }
  const bodies: RecLayout["bodies"] = [];
  for (const [robot, names] of Object.entries(sim.index.linkNames)) {
    for (const [link, mj] of Object.entries(names)) {
      bodies.push({ robot, link, mj });
    }
  }
  const parts = loads.filter((load) => load.drive);
  const boardIds = boards.map((board) => board.id);
  layout = { joints, bodies, parts, supplies: supplySpecs, boards: boardIds };
  recordingSeq += 1;
  recorder = new RunRecorder({
    id: `r${recordingSeq}`,
    joints: joints.map(({ robot, joint }) => ({ robot, joint })),
    bodies: bodies.map(({ robot, link }) => ({ robot, link })),
    parts: parts.map((load) => load.partId),
    supplies: supplySpecs.map((supply) => supply.id),
    boards: boardIds,
  });
  fillRecorder(true);
  recorder.commit(simMs());
  for (const board of boards) {
    if (!board.fault) continue;
    recorder.noteEvent({
      timeMs: simMs(),
      kind: "fault",
      board: board.id,
      message: board.fault,
    });
  }
}

function recordStep() {
  const rec = recorder;
  if (!rec?.enabled || !sim) {
    pendingNotes.length = 0;
    return;
  }
  const ms = simMs();
  fillRecorder(ms % RECORD_FRAME_MS === 0);
  for (const board of boards) {
    const text = board.peekTx();
    let seen = txSeen.get(board.id) ?? 0;
    if (text.length < seen) seen = 0;
    if (text.length > seen) {
      rec.noteSerial(board.id, text.slice(seen), ms);
      seen = text.length;
    }
    txSeen.set(board.id, seen);
  }
  for (const note of pendingNotes) {
    rec.noteEvent({ timeMs: ms, kind: note.kind, board: note.board });
  }
  pendingNotes.length = 0;
  rec.commit(ms);
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
  recorder?.noteEvent({
    timeMs: simMs(),
    kind: "fault",
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
  // No supply: the CPU never starts. A later step does not boot it either.
  if (!boardPower.get(spec.id)?.supplyId) return board;
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

function restingCurrent(load: Load): number {
  return load.supplyId ? load.idleCurrent : 0;
}

/**
 * One power walk per load. `bootBoard` reads this map, so it is filled
 * before the CPUs start and not again when the servos are bound.
 */
function fillBoardPower(doc: WorldDocument) {
  const feeds = powerFeeds(doc);
  partFeeds = feeds.parts;
  supplySpecs = doc.supplies.map((supply) => ({
    id: supply.id,
    voltage: supply.voltage,
    currentLimit: supply.currentLimit,
    rDroop: supply.rDroop,
  }));
  boardPower = new Map();
  for (const spec of boardSpecsOf(doc)) {
    const row = doc.boards.find((item) => item.id === spec.id);
    const model = row ? boardModel(row.board) : undefined;
    const chip = chipModel(spec.chip);
    const supplyId = feeds.boards[spec.id] ?? null;
    boardPower.set(spec.id, {
      supplyId,
      draw: supplyId ? (model?.current ?? 0) : 0,
      brownoutVoltage: chip?.brownoutVoltage ?? Number.POSITIVE_INFINITY,
      resets: 0,
    });
  }
}

/**
 * Wire each servo signal. An unwired V+ draws nothing. Speed and torque
 * start at the part-model numbers; each step scales them by V / V_nom.
 */
function bindPower(doc: WorldDocument) {
  loads = [];
  if (!sim) return;
  const drives = servoSignalDrives(doc);
  for (const part of doc.parts) {
    const model = partModel(part.model);
    if (!model?.current) continue;
    const supplyId = partFeeds[part.id] ?? null;
    const signal = drives.find((item) => item.partId === part.id);
    let drive: ServoDrive | null = null;
    if (signal && part.drives && sim) {
      const bit = arduinoPinBit(signal.pin);
      const actuatorId = sim.index.parts[part.id];
      const speed = model.speedDegPerSec;
      const torque = model.torqueNm;
      const board = boards.find((item) => item.id === signal.boardId);
      if (
        board &&
        bit !== undefined &&
        actuatorId !== undefined &&
        speed !== undefined &&
        torque !== undefined
      ) {
        board.watchEdge(bit);
        setActuatorTorque(actuatorId, 0);
        drive = {
          board,
          pinBit: bit,
          actuatorId,
          jointName: `${part.drives.robot}/${part.drives.joint}`,
          speedRadPerSec: (speed * Math.PI) / 180,
          torqueNm: torque,
          nominalVoltage: model.supply?.nominal ?? 0,
          scale: model.voltageScale === "V/V_nom",
          track: blankTrack(),
          slewing: false,
        };
      }
    }
    const load: Load = {
      partId: part.id,
      supplyId,
      idleCurrent: model.current.idle,
      movingCurrent: model.current.moving,
      stallCurrent: model.current.stall,
      stall: model.stall ?? null,
      state: "idle",
      holdMs: 0,
      current: 0,
      drive,
    };
    load.current = restingCurrent(load);
    loads.push(load);
  }
  applySupplyVoltages();
}

function rearmServos(boardId: string, board: AvrBoard) {
  for (const load of loads) {
    const drive = load.drive;
    if (!drive || drive.board.id !== boardId) continue;
    drive.board = board;
    board.watchEdge(drive.pinBit);
    drive.track = blankTrack();
    drive.slewing = false;
    load.holdMs = 0;
    load.state = "idle";
    load.current = restingCurrent(load);
    setActuatorTorque(drive.actuatorId, 0);
  }
}

/**
 * Rail voltage for this step, from the currents `classifyLoads` stored
 * last step (and from each powered board's catalog draw). Part state is
 * not recomputed here, so a stall cannot sag the rail it is still using.
 */
function applySupplyVoltages() {
  stepDraw.clear();
  for (const supply of supplySpecs) stepDraw.set(supply.id, 0);
  for (const power of boardPower.values()) {
    if (!power.supplyId) continue;
    stepDraw.set(
      power.supplyId,
      (stepDraw.get(power.supplyId) ?? 0) + power.draw
    );
  }
  for (const load of loads) {
    if (!load.supplyId) continue;
    stepDraw.set(
      load.supplyId,
      (stepDraw.get(load.supplyId) ?? 0) + load.current
    );
  }
  const next: Record<string, WorldSupplyState> = {};
  for (const supply of supplySpecs) {
    const current = stepDraw.get(supply.id) ?? 0;
    next[supply.id] = {
      current,
      voltage: supplyVoltage(
        supply.voltage,
        supply.currentLimit,
        supply.rDroop,
        current
      ),
    };
  }
  supplyLive = next;
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
  // The new image has not run, and this board's servos are idle. Publish
  // the rail those currents actually draw. A sag that is still under the
  // brownout voltage holds the new CPU in reset.
  applySupplyVoltages();
  const power = boardPower.get(id);
  if (power?.supplyId && !next.fault) {
    const voltage = supplyOf(power.supplyId);
    if (voltage < power.brownoutVoltage) next.holdInReset();
  }
  rxSent.delete(id);
  faulted.delete(id);
  if (next.running) {
    const ms = simMs();
    recorder?.noteEvent({ timeMs: ms, kind: "reload", board: id });
    recorder?.noteSerial(id, FIRMWARE_RELOADED, ms);
    txSeen.set(id, 0);
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

function serialIn(id: string, text: string, by?: WorldSender) {
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
  if (by) {
    recorder?.noteEvent({
      timeMs: simMs(),
      kind: "serial-send",
      board: id,
      text,
      by,
    });
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

function supplyOf(id: string | null): number {
  if (!id) return 0;
  return supplyLive[id]?.voltage ?? 0;
}

/** Apply this millisecond's pulses. Torque and slew use this step's voltage. */
function applyServos() {
  if (!sim) return;
  const simTime = sim.data.time;
  stepPulses.clear();
  for (const board of boards) {
    const taken = board.takePulses();
    if (taken.length > 0) stepPulses.set(board.id, taken);
  }
  for (const load of loads) {
    const drive = load.drive;
    if (!drive) continue;
    const cpu = drive.board;
    const driven = Boolean(cpu.running && !cpu.brownout);
    const taken = driven ? stepPulses.get(cpu.id) : undefined;
    const widths = taken
      ? taken
          .filter((pulse) => pulse.bit === drive.pinBit)
          .map((pulse) => pulse.us)
      : [];
    const voltage = supplyOf(load.supplyId);
    const factor =
      load.supplyId === null
        ? 0
        : drive.scale
          ? scaleWithVoltage(1, voltage, drive.nominalVoltage)
          : 1;
    const qpos = scalar(sim.data.jnt(drive.jointName).qpos as Float64Array);
    const stepped = trackServo({
      track: drive.track,
      simTime,
      pulsesUs: widths,
      qpos,
      speedRadPerSec: drive.speedRadPerSec * factor,
      driven,
    });
    drive.track = stepped.track;
    const target =
      stepped.track.commandDeg === null
        ? null
        : (stepped.track.commandDeg * Math.PI) / 180;
    drive.slewing =
      !stepped.limp &&
      target !== null &&
      stepped.track.setpoint !== null &&
      Math.abs(stepped.track.setpoint - target) > 1e-9;
    const torque = stepped.limp ? 0 : drive.torqueNm * factor;
    setActuatorTorque(drive.actuatorId, torque);
    if (!stepped.limp && stepped.ctrl !== null) {
      sim.data.actuator(load.partId).ctrl = stepped.ctrl;
    }
  }
}

/** Joint after `mj_step` decides idle, moving, or stall for the next rail. */
function classifyLoads() {
  if (!sim) return;
  for (const load of loads) {
    const drive = load.drive;
    if (!load.supplyId || !drive || !load.stall) {
      load.state = "idle";
      load.holdMs = 0;
      load.current = restingCurrent(load);
      continue;
    }
    const qpos = scalar(sim.data.jnt(drive.jointName).qpos as Float64Array);
    const qvel = scalar(sim.data.jnt(drive.jointName).qvel as Float64Array);
    const stepped = stepPartMotion({
      holdMs: load.holdMs,
      limp: drive.track.commandDeg === null,
      slewing: drive.slewing,
      commandDeg: drive.track.commandDeg,
      measuredDeg: (qpos * 180) / Math.PI,
      velocityDegPerSec: (qvel * 180) / Math.PI,
      stall: load.stall,
      current: {
        idle: load.idleCurrent,
        moving: load.movingCurrent,
        stall: load.stallCurrent,
      },
      dtMs: 1,
    });
    load.state = stepped.state;
    load.holdMs = stepped.holdMs;
    load.current = stepped.current;
  }
}

/**
 * One millisecond. The rail is the previous step's currents. A board
 * under its brownout voltage does not execute, and its pins float, so
 * the servo goes limp. MuJoCo still steps. Voltage back at the brownout
 * threshold boots the same image from address 0.
 */
function advanceOne() {
  if (!sim) return;
  if (throwOnStep) {
    throwOnStep = false;
    throw new Error("injected step fault");
  }
  applySupplyVoltages();
  for (const board of boards) {
    const power = boardPower.get(board.id);
    if (!power?.supplyId || board.fault) continue;
    const voltage = supplyOf(power.supplyId);
    if (voltage < power.brownoutVoltage) {
      if (!board.brownout) board.holdInReset();
      continue;
    }
    if (board.brownout) {
      if (!board.reboot()) continue;
      power.resets += 1;
      pendingNotes.push({ kind: "reset", board: board.id });
      pendingNotes.push({ kind: "reboot", board: board.id });
      post({ type: "brownoutBoot", generation, board: board.id });
      rearmServos(board.id, board);
    }
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
  classifyLoads();
  recordStep();
}

function dispose() {
  playing = false;
  throwOnStep = false;
  recorder = null;
  layout = null;
  txSeen.clear();
  pendingNotes.length = 0;
  boards = [];
  loads = [];
  boardPower = new Map();
  supplySpecs = [];
  partFeeds = {};
  supplyLive = {};
  stepDraw.clear();
  stepPulses.clear();
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
  // Feeds are known before boot: an unwired board does not run.
  fillBoardPower(parsed as WorldDocument);
  loadBoards(parsed);
  bindPower(parsed as WorldDocument);
  openRecorder();
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

function play(by?: WorldSender) {
  if (!sim) return;
  noteCommand("play", by);
  playing = true;
  lastWall = performance.now();
  stepDebt = 0;
  sinceState = 0;
  arm();
  postState();
}

function pause(by?: WorldSender) {
  if (!sim) return;
  noteCommand("pause", by);
  stopClock();
  postState();
}

function step(n: number, pauseBy?: WorldSender) {
  if (!sim) return;
  if (!Number.isInteger(n) || n < 0 || n > MAX_STEP_N) {
    fail(
      [],
      `step(${String(n)}) is not a whole number of steps from 0 to ${MAX_STEP_N}.`
    );
    return;
  }
  // A step is exact. Stop the wall clock first so the two do not add.
  if (pauseBy) noteCommand("pause", pauseBy);
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

function answerRecord(message: Extract<ToWorker, { type: "record" }>) {
  const reply = (body: RecordBody) => {
    post({
      type: "record",
      generation,
      request: message.request,
      body,
    });
  };
  if (message.generation !== generation || !recorder || !sim) {
    reply({
      op: "error",
      message:
        message.generation !== generation
          ? "world reloaded"
          : "world is not running",
    });
    return;
  }
  const query = message.query;
  if (query.op === "config") {
    if (query.boundMs !== undefined) recorder.setBoundMs(query.boundMs);
    if (query.enabled !== undefined) recorder.enabled = query.enabled;
    reply({ op: "ack" });
    return;
  }
  if (query.op === "info") {
    reply({ op: "info", info: recorder.info(sim.data.time) });
    return;
  }
  if (query.op === "frame") {
    reply({ op: "frame", id: recorder.id, frame: recorder.frameAt(query.t) });
    return;
  }
  if (query.op === "timeline") {
    const info = recorder.info(sim.data.time);
    const read = recorder.read({
      from: query.from,
      to: query.to,
      tracks: [
        ...info.tracks.joints,
        ...info.tracks.supplies,
        ...info.tracks.parts,
      ],
      maxFrames: query.maxPoints,
    });
    const built = timelineFromRead(read);
    reply({
      op: "timeline",
      id: info.id,
      from: query.from,
      to: query.to,
      tracks: built.tracks,
      markers: built.markers,
    });
    return;
  }
  reply({
    op: "read",
    read: recorder.read({
      from: query.from,
      to: query.to,
      ...(query.tracks ? { tracks: query.tracks } : {}),
      ...(query.maxFrames !== undefined ? { maxFrames: query.maxFrames } : {}),
    }),
  });
}

async function handle(message: ToWorker) {
  if (message.type === "stop") {
    stopClock();
    dispose();
    return;
  }
  if (message.type === "record") {
    answerRecord(message);
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
  if (message.type === "play") play(message.by);
  else if (message.type === "pause") pause(message.by);
  else if (message.type === "step") step(message.n, message.pauseBy);
  else if (message.type === "setTarget")
    setTarget(message.partId, message.radians);
  else if (message.type === "reloadBoard") reloadBoard(message.board);
  else if (message.type === "serialIn") {
    serialIn(message.board, message.text, message.by);
  } else if (message.type === "fault") throwOnStep = true;
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
