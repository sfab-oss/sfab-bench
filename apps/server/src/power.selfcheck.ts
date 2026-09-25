import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  boardModels,
  chipModels,
  partModels,
  supplyPresets,
  type WorldDocument,
  type WorldServerMessage,
  type WorldState,
} from "@sfab-bench/contract";

import { closeRootWatches } from "./projects";
import { BROWNOUT_RESET } from "./world/board";
import { attachWorld, stopWorld } from "./world/host";
import { scaleWithVoltage, stepPartMotion, supplyVoltage } from "./world/power";
import { powerFeeds } from "./world/wiring";

/**
 * Power budget on sim time. Samples are the state posted for that sim
 * time. Serial text is the chunks that arrived with that state.
 */

const armDir = fileURLToPath(
  new URL("../../../examples/arm/", import.meta.url)
);

function expect(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(label);
}

function loadWorld(dir: string, name: string): WorldDocument {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as WorldDocument;
}

const hold = loadWorld(armDir, "arm.world.json");
const feeds = powerFeeds(hold);
expect(feeds.boards.uno === "usb", `uno feed ${feeds.boards.uno}`);
expect(feeds.parts.servo === "usb", `servo feed ${feeds.parts.servo}`);

const unwired = structuredClone(hold);
unwired.wires = unwired.wires.filter((wire) => !wire.includes("servo.V+"));
const lost = powerFeeds(unwired);
expect(lost.parts.servo === null, "an unwired V+ is unpowered");
expect(lost.boards.uno === "usb", "the board stays on usb");
console.log("power nets: usb feeds uno and servo; unwired V+ draws nothing");

const usb = supplyPresets.usb;
expect(
  supplyVoltage(usb.voltage, usb.currentLimit, usb.rDroop, 0.3) === 5,
  "300 mA stays at 5 V"
);
expect(
  supplyVoltage(usb.voltage, usb.currentLimit, usb.rDroop, 0.75) === 2.5,
  "750 mA sags to 2.5 V"
);
expect(
  supplyVoltage(usb.voltage, usb.currentLimit, usb.rDroop, 1.2) === 0,
  "1.2 A clamps at 0 V"
);
console.log("supply math: 300 mA → 5 V, 750 mA → 2.5 V, 1.2 A → 0 V");

const rule = partModels.sg90.stall;
const currents = partModels.sg90.current;
expect(rule && currents, "sg90 publishes a stall rule and currents");
if (!rule || !currents) throw new Error("unreachable");

let holdMs = 0;
let motion = stepPartMotion({
  holdMs,
  limp: false,
  slewing: false,
  commandDeg: 180,
  measuredDeg: 151.4,
  velocityDegPerSec: 0,
  stall: rule,
  current: currents,
  dtMs: 1,
});
for (let ms = 1; ms <= rule.holdMs; ms++) {
  motion = stepPartMotion({
    holdMs,
    limp: false,
    slewing: false,
    commandDeg: 180,
    measuredDeg: 151.4,
    velocityDegPerSec: 0,
    stall: rule,
    current: currents,
    dtMs: 1,
  });
  holdMs = motion.holdMs;
  if (ms < rule.holdMs) {
    expect(motion.state !== "stall", `stall fired at ${ms} ms`);
    expect(motion.state === "moving", `buildup state ${motion.state}`);
    expect(
      motion.current === currents.moving,
      "buildup draws the moving current"
    );
  }
}
expect(motion.state === "stall", `after ${rule.holdMs} ms: ${motion.state}`);
expect(motion.current === currents.stall, "stall draws the stall current");
expect(holdMs === rule.holdMs, `hold ${holdMs}`);

const nudged = stepPartMotion({
  holdMs: rule.holdMs - 1,
  limp: false,
  slewing: false,
  commandDeg: 180,
  measuredDeg: 151.4,
  velocityDegPerSec: rule.maxVelocityDegPerSec,
  stall: rule,
  current: currents,
  dtMs: 1,
});
expect(nudged.holdMs === 0, "velocity at the threshold clears the hold");
expect(nudged.state !== "stall", "a cleared hold is not a stall");

holdMs = 0;
for (let ms = 1; ms <= rule.holdMs; ms++) {
  motion = stepPartMotion({
    holdMs,
    limp: false,
    slewing: false,
    commandDeg: 180,
    measuredDeg: 151.4,
    velocityDegPerSec: 0,
    stall: rule,
    current: currents,
    dtMs: 1,
  });
  holdMs = motion.holdMs;
  if (ms < rule.holdMs)
    expect(motion.state !== "stall", `rebuilt stall at ${ms}`);
}
expect(motion.state === "stall", "a fresh 50 ms hold stalls again");

holdMs = 0;
for (let ms = 0; ms < 200; ms++) {
  motion = stepPartMotion({
    holdMs,
    limp: false,
    slewing: false,
    commandDeg: 90,
    measuredDeg: 90 - rule.minAngleErrorDeg,
    velocityDegPerSec: 0,
    stall: rule,
    current: currents,
    dtMs: 1,
  });
  holdMs = motion.holdMs;
  expect(
    motion.state !== "stall",
    `error of ${rule.minAngleErrorDeg}° stalled`
  );
  expect(motion.state === "idle", `small error state ${motion.state}`);
  expect(
    motion.current === currents.idle,
    "a settled servo draws idle current"
  );
}

const limp = stepPartMotion({
  holdMs: 40,
  limp: true,
  slewing: false,
  commandDeg: 180,
  measuredDeg: 151.4,
  velocityDegPerSec: 0,
  stall: rule,
  current: currents,
  dtMs: 1,
});
expect(
  limp.state === "idle" && limp.holdMs === 0 && limp.current === currents.idle,
  "no signal is idle and clears the hold"
);
console.log("stall rule: 50 ms hold, a fast sample resets it, 5° never stalls");

const speed = partModels.sg90.speedDegPerSec ?? 0;
const nominal = partModels.sg90.supply?.nominal ?? 0;
expect(speed > 0 && nominal > 0, "sg90 speed and nominal voltage");
const at4 = scaleWithVoltage(speed, 4, nominal);
expect(
  Math.abs(at4 / speed - 0.8) < 1e-12,
  `4 V slew ${at4} is not 0.8× ${speed}`
);
console.log(`voltage scale: 4 V slew is ${at4} deg/s, 0.8× ${speed}`);

expect(
  BROWNOUT_RESET === "— brownout reset —\n",
  `marker ${JSON.stringify(BROWNOUT_RESET)}`
);

type Waiter = {
  seconds: number;
  resolve: (state: WorldState) => void;
  reject: (err: Error) => void;
};

function openTrace(project: string, worldRel: string) {
  const events: WorldServerMessage[] = [];
  const waiters: Waiter[] = [];
  const fail = (err: Error) => {
    for (const waiter of waiters.splice(0)) waiter.reject(err);
  };
  const attached = attachWorld(project, worldRel, {
    sender: { kind: "loopback", label: "Mac" },
    onEvent(event) {
      events.push(event);
      if (event.type === "error") {
        const text =
          event.message ?? event.errors.map((item) => item.message).join("; ");
        fail(new Error(text || "world error"));
        return;
      }
      if (event.type !== "state") return;
      for (let i = waiters.length - 1; i >= 0; i--) {
        const waiter = waiters[i];
        if (!waiter) continue;
        if (Math.abs(event.state.simTime - waiter.seconds) > 0.0004) continue;
        waiters.splice(i, 1);
        waiter.resolve(event.state);
      }
    },
  });
  return {
    events,
    attached,
    at(seconds: number): Promise<WorldState> {
      const hit = [...events]
        .reverse()
        .find(
          (event) =>
            event.type === "state" &&
            Math.abs(event.state.simTime - seconds) <= 0.0004
        );
      if (hit?.type === "state") return Promise.resolve(hit.state);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(
            (waiter) => waiter.resolve === resolve
          );
          if (index >= 0) waiters.splice(index, 1);
          const last = [...events]
            .reverse()
            .find((event) => event.type === "state");
          const seen = last?.type === "state" ? last.state.simTime : "none";
          reject(
            new Error(`timed out at ${seconds.toFixed(3)}s, last ${seen}`)
          );
        }, 20000);
        waiters.push({
          seconds,
          resolve: (state) => {
            clearTimeout(timer);
            resolve(state);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
      });
    },
  };
}

type Row = {
  state: WorldState;
  serial: Record<string, string>;
};

function serialText(events: WorldServerMessage[], board: string): string {
  let text = "";
  for (const event of events) {
    if (event.type === "serial" && event.board === board) text += event.text;
  }
  return text;
}

async function sample(
  project: string,
  worldRel: string,
  totalMs: number,
  stepMs: number,
  boards: readonly string[]
): Promise<Row[]> {
  const trace = openTrace(project, worldRel);
  const attached = await trace.attached;
  if ("error" in attached) throw new Error(attached.error);
  try {
    const rows: Row[] = [];
    for (let ms = stepMs; ms <= totalMs; ms += stepMs) {
      attached.step(stepMs);
      const state = await trace.at(ms / 1000);
      const serial: Record<string, string> = {};
      for (const board of boards)
        serial[board] = serialText(trace.events, board);
      rows.push({ state, serial });
    }
    return rows;
  } finally {
    attached.detach();
    await stopWorld(project, worldRel);
    closeRootWatches();
  }
}

function bootCount(text: string | undefined): number {
  return text ? (text.match(/boot/g) ?? []).length : 0;
}

/** The first state posted after `from`, not whichever event is last. */
function stateAfter(
  events: WorldServerMessage[],
  from: number
): Promise<WorldState> {
  const found = () => {
    for (const event of events.slice(from)) {
      if (event.type === "state") return event.state;
    }
    return null;
  };
  const ready = found();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("timed out waiting for the state after reload"));
    }, 10000);
    const poll = setInterval(() => {
      const state = found();
      if (!state) return;
      clearInterval(poll);
      clearTimeout(timer);
      resolve(state);
    }, 15);
  });
}

const holdRows = await sample(armDir, "arm.world.json", 3500, 1, ["uno"]);
let holdMin = Infinity;
for (const row of holdRows) {
  const voltage = row.state.supplies?.usb?.voltage ?? Number.NaN;
  if (voltage < holdMin) holdMin = voltage;
  const board = row.state.boards.uno;
  expect(voltage >= 4.5, `hold rail ${voltage} V at ${row.state.simTime}`);
  expect(board?.resets === 0, `hold resets ${board?.resets}`);
  expect(board?.brownout !== true, "hold board browned out");
  expect(board?.running === true, "hold board stopped");
}
console.log(`hold minimum voltage ${holdMin.toFixed(3)} V`);

const stallRows = await sample(armDir, "arm-stall.world.json", 2000, 1, [
  "uno",
]);
const stallAt = stallRows.find(
  (row) => row.state.parts?.servo?.state === "stall"
);
const sagAt = stallRows.find(
  (row) => (row.state.supplies?.usb?.voltage ?? 5) < 2.7
);
const resetAt = stallRows.find(
  (row) => row.state.boards.uno?.brownout === true
);
const rebootAt = stallRows.find(
  (row) => (row.state.boards.uno?.resets ?? 0) >= 1
);
const secondBoot = stallRows.find((row) => bootCount(row.serial.uno) >= 2);
expect(stallAt, "no stall sample within 2 s");
expect(
  stallAt?.state.parts?.servo?.current === currents.stall,
  "stall current"
);
expect(sagAt, "rail never fell below 2.7 V");
expect(
  sagAt !== undefined &&
    Math.abs((sagAt.state.supplies?.usb?.voltage ?? 0) - 2.5) < 1e-6,
  `sag voltage ${sagAt?.state.supplies?.usb?.voltage}`
);
expect(resetAt, "board never entered brownout");
expect(rebootAt, "board never counted a reset");
expect(
  rebootAt?.serial.uno?.includes("— brownout reset —"),
  `marker missing in ${JSON.stringify(rebootAt?.serial.uno)}`
);
expect(secondBoot, "firmware did not print boot a second time");
expect(
  (secondBoot?.state.simTime ?? 9) <= 2,
  `second boot at ${secondBoot?.state.simTime}`
);
console.log(
  `demo 2: stall ${stallAt?.state.simTime.toFixed(3)} s, ` +
    `sag ${sagAt?.state.simTime.toFixed(3)} s, ` +
    `reset ${resetAt?.state.simTime.toFixed(3)} s, ` +
    `reboot ${rebootAt?.state.simTime.toFixed(3)} s, ` +
    `second boot ${secondBoot?.state.simTime.toFixed(3)} s`
);

function twoArm(root: string, sharedRail: boolean): string {
  const world = loadWorld(root, "arm.world.json");
  const robot = world.robots[0];
  const uno = world.boards[0];
  const servo = world.parts[0];
  const supply = world.supplies[0];
  if (!robot || !uno || !servo?.drives || !supply) {
    throw new Error("fixture shape");
  }
  world.robots = [
    { ...robot, id: "hold-arm" },
    {
      ...robot,
      id: "stall-arm",
      pose: { position: [0.3, 0, 0], rotation: [1, 0, 0, 0] },
    },
  ];
  world.boards = [
    {
      ...uno,
      id: "hold",
      firmware: "firmware/hold/hold.hex",
      source: "firmware/hold/hold.ino",
    },
    {
      ...uno,
      id: "stall",
      firmware: "firmware/stall/stall.hex",
      source: "firmware/stall/stall.ino",
      pose: { position: [0.4, 0, 0.006], rotation: [1, 0, 0, 0] },
    },
  ];
  world.parts = [
    {
      ...servo,
      id: "hold-servo",
      drives: { robot: "hold-arm", joint: "shoulder" },
    },
    {
      ...servo,
      id: "stall-servo",
      drives: { robot: "stall-arm", joint: "shoulder" },
    },
  ];
  const name = sharedRail ? "shared.world.json" : "split.world.json";
  if (sharedRail) {
    world.supplies = [{ ...supply, id: "usb" }];
    world.wires = [
      ["usb.5V", "hold.5V"],
      ["usb.GND", "hold.GND"],
      ["usb.5V", "stall.5V"],
      ["usb.GND", "stall.GND"],
      ["hold.D9", "hold-servo.signal"],
      ["hold.5V", "hold-servo.V+"],
      ["hold.GND", "hold-servo.GND"],
      ["stall.D9", "stall-servo.signal"],
      ["stall.5V", "stall-servo.V+"],
      ["stall.GND", "stall-servo.GND"],
    ];
  } else {
    world.supplies = [
      { ...supply, id: "usb-hold" },
      { ...supply, id: "usb-stall" },
    ];
    world.wires = [
      ["usb-hold.5V", "hold.5V"],
      ["usb-hold.GND", "hold.GND"],
      ["hold.D9", "hold-servo.signal"],
      ["hold.5V", "hold-servo.V+"],
      ["hold.GND", "hold-servo.GND"],
      ["usb-stall.5V", "stall.5V"],
      ["usb-stall.GND", "stall.GND"],
      ["stall.D9", "stall-servo.signal"],
      ["stall.5V", "stall-servo.V+"],
      ["stall.GND", "stall-servo.GND"],
    ];
  }
  writeFileSync(join(root, name), JSON.stringify(world));
  return name;
}

const splitRoot = mkdtempSync(join(tmpdir(), "sfab-power-split-"));
const sharedRoot = mkdtempSync(join(tmpdir(), "sfab-power-shared-"));
try {
  cpSync(armDir, splitRoot, { recursive: true });
  cpSync(armDir, sharedRoot, { recursive: true });
  const splitName = twoArm(splitRoot, false);
  const split = await sample(splitRoot, splitName, 2000, 1, ["hold", "stall"]);
  let holdMin = Infinity;
  for (const row of split) {
    const voltage = row.state.supplies?.["usb-hold"]?.voltage ?? Number.NaN;
    if (voltage < holdMin) holdMin = voltage;
    const board = row.state.boards.hold;
    expect(voltage >= 4.999, `split hold rail ${voltage} V`);
    expect(board?.resets === 0 && board.brownout !== true, "split hold reset");
  }
  const stallSide = split.find(
    (row) => (row.state.boards.stall?.resets ?? 0) >= 1
  );
  const stallSag = split.find(
    (row) => (row.state.supplies?.["usb-stall"]?.voltage ?? 5) < 2.7
  );
  expect(stallSag, "stall supply never sagged");
  expect(stallSide, "stall board never reset");
  expect(
    stallSide?.serial.stall?.includes("— brownout reset —"),
    "stall marker missing"
  );
  expect(bootCount(stallSide?.serial.stall) >= 2, "stall did not boot again");
  console.log(
    `two supplies: hold stays ${holdMin.toFixed(2)} V, stall resets at ${stallSide?.state.simTime.toFixed(3)} s`
  );

  const sharedName = twoArm(sharedRoot, true);
  const shared = await sample(sharedRoot, sharedName, 2000, 1, [
    "hold",
    "stall",
  ]);
  // Both boards and both servos sit on the one USB rail. The stall
  // servo's 700 mA plus the two Uno currents is already over the 500 mA
  // limit, so the rail falls below 2.7 V for every board on it. The hold
  // board resets even though its own servo is not stalled, and that cuts
  // the hold arm's signal.
  const sharedSag = shared.find(
    (row) => (row.state.supplies?.usb?.voltage ?? 5) < 2.7
  );
  const holdReset = shared.find(
    (row) => (row.state.boards.hold?.resets ?? 0) >= 1
  );
  const stallReset = shared.find(
    (row) => (row.state.boards.stall?.resets ?? 0) >= 1
  );
  expect(sharedSag, "shared rail never sagged");
  expect(holdReset, "hold board on the shared rail never reset");
  expect(stallReset, "stall board on the shared rail never reset");
  expect(
    holdReset.serial.hold?.includes("— brownout reset —"),
    "hold marker missing"
  );
  console.log(
    `shared rail: hold resets at ${holdReset.state.simTime.toFixed(3)} s, stall at ${stallReset.state.simTime.toFixed(3)} s`
  );

  const reloadRoot = mkdtempSync(join(tmpdir(), "sfab-power-reload-"));
  try {
    cpSync(armDir, reloadRoot, { recursive: true });
    const trace = openTrace(reloadRoot, "arm-stall.world.json");
    const attached = await trace.attached;
    if ("error" in attached) throw new Error(attached.error);
    try {
      attached.step(524);
      const browned = await trace.at(0.524);
      const brownedRail = browned.supplies?.usb;
      const brownedPart = browned.parts?.servo;
      expect(
        browned.boards.uno?.brownout === true &&
          (brownedRail?.voltage ?? 5) < chipModels.atmega328p.brownoutVoltage &&
          brownedPart?.state === "idle" &&
          brownedPart.current === partModels.sg90.current?.idle,
        `brownout sample ${browned.boards.uno?.brownout} ${brownedRail?.voltage} V ${brownedPart?.state} ${brownedPart?.current} A`
      );
      const hexPath = join(reloadRoot, "firmware/stall/stall.hex");
      const from = trace.events.length;
      writeFileSync(hexPath, readFileSync(hexPath));
      const published = await stateAfter(trace.events, from);
      const rail = published.supplies?.usb;
      const part = published.parts?.servo;
      const board = published.boards.uno;
      const idle = partModels.sg90.current?.idle ?? 0;
      const draw = boardModels.uno.current + idle;
      expect(
        published.simTime.toFixed(3) === "0.524",
        `reload moved sim to ${published.simTime}`
      );
      expect(rail, "reload dropped the supply");
      expect(
        part?.state === "idle" && part.current === idle,
        "servo stays idle"
      );
      if (!rail) throw new Error("unreachable");
      const voltage = supplyVoltage(
        supplyPresets.usb.voltage,
        supplyPresets.usb.currentLimit,
        supplyPresets.usb.rDroop,
        rail.current
      );
      expect(
        Math.abs(rail.current - draw) < 1e-9 &&
          Math.abs(rail.voltage - voltage) < 1e-9,
        `rail ${rail.voltage} V at ${rail.current} A, formula ${voltage} V from ${draw} A`
      );
      const under = rail.voltage < chipModels.atmega328p.brownoutVoltage;
      expect(
        under
          ? board?.brownout === true && board.running === false
          : board?.brownout === false && board.running === true,
        `running ${board?.running} brownout ${board?.brownout} at ${rail.voltage} V`
      );
      expect(!under && rail.voltage === 5, `recovered rail ${rail.voltage} V`);
      console.log(
        `hex reload during brownout: ${rail.voltage.toFixed(2)} V, ${rail.current} A, running ${board?.running}, brownout ${board?.brownout}`
      );
    } finally {
      attached.detach();
      await stopWorld(reloadRoot, "arm-stall.world.json");
    }
  } finally {
    rmSync(reloadRoot, { recursive: true, force: true });
  }
} finally {
  rmSync(splitRoot, { recursive: true, force: true });
  rmSync(sharedRoot, { recursive: true, force: true });
  closeRootWatches();
}

console.log("power.selfcheck ok");
