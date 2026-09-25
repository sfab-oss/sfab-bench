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
import { Worker } from "node:worker_threads";

import type { WorldServerMessage } from "@sfab-bench/contract";

import { handleProjectFile } from "./cad-pkg";
import { listProjectFiles } from "./projects";
import { projectReal, readerFor } from "./world/files";
import {
  attachWorld,
  stopWorld,
  type WorldHandle,
  worldWorkerCount,
  worldWorkerEntry,
} from "./world/host";
import { compileWorld, ensureMujocoCompiler } from "./world/model";
import type { FromWorker, ToWorker } from "./world/worker";

/**
 * The arm fixture, sim time only. Wall-clock play is not what this checks:
 * `step(n)` advances exactly n milliseconds of simulation.
 */

const armDir = fileURLToPath(
  new URL("../../../examples/arm/", import.meta.url)
);

function expect(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(label);
}

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function waitUntil(
  pred: () => boolean,
  label: string,
  ms = 8000
): Promise<void> {
  if (pred()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`timed out: ${label}`));
    }, ms);
    const poll = setInterval(() => {
      if (!pred()) return;
      clearInterval(poll);
      clearTimeout(timer);
      resolve();
    }, 15);
  });
}

const rootReal = projectReal(armDir);
expect(rootReal, "arm fixture resolves");
const compiled = await compileWorld(
  JSON.parse(readFileSync(join(armDir, "arm.world.json"), "utf8")) as unknown,
  readerFor(rootReal, "arm.world.json")
);
expect(
  compiled.ok,
  `compile: ${compiled.ok ? "" : compiled.errors.map((e) => e.message).join("; ")}`
);
if (!compiled.ok) throw new Error("unreachable");
const { index } = compiled;
expect(
  index.nbody >= 3,
  `bodies ${index.nbody} (${index.bodyNames.join(",")})`
);
expect(index.bodyNames.includes("world"), "world body");
expect(
  index.bodyNames.includes("arm/base"),
  `base body in ${index.bodyNames.join(",")}`
);
expect(
  index.bodyNames.includes("arm/upper_arm"),
  `upper arm body in ${index.bodyNames.join(",")}`
);
expect(
  index.geomNames.includes("ground"),
  `ground geom in ${index.geomNames.join(",")}`
);
expect(
  index.njnt === 1,
  `joints ${index.njnt} (${index.jointNames.join(",")})`
);
expect(index.jointNames.join(",") === "arm/shoulder", "shoulder joint");
expect(index.nu === 1, `actuators ${index.nu}`);
expect(index.actuatorNames.join(",") === "servo", "servo actuator");
expect(
  index.nmesh === 2,
  `meshes ${index.nmesh} (${index.meshNames.join(",")})`
);
expect(index.parts.servo === 0, `servo actuator id ${index.parts.servo}`);
expect(
  index.joints.arm?.shoulder === 0,
  `shoulder qpos ${index.joints.arm?.shoulder}`
);
expect((index.links.arm?.base ?? -1) > 0, "base body id");
expect((index.links.arm?.upper_arm ?? -1) > 0, "upper_arm body id");
compiled.model.delete();
compiled.vfs.delete();

const stripped = ensureMujocoCompiler(
  readFileSync(join(armDir, "robot/arm.urdf"), "utf8").replace(
    /<mujoco>[\s\S]*?<\/mujoco>\s*/,
    ""
  )
);
expect(stripped.includes('fusestatic="false"'), "injected fusestatic");
expect(stripped.includes('discardvisual="false"'), "injected discardvisual");
const bareRoot = mkdtempSync(join(tmpdir(), "sfab-world-bare-"));
cpSync(armDir, bareRoot, { recursive: true });
writeFileSync(
  join(bareRoot, "robot/arm.urdf"),
  readFileSync(join(armDir, "robot/arm.urdf"), "utf8").replace(
    /<mujoco>[\s\S]*?<\/mujoco>\s*/,
    ""
  )
);
const bareReal = projectReal(bareRoot);
expect(bareReal, "bare copy resolves");
const bare = await compileWorld(
  JSON.parse(readFileSync(join(bareRoot, "arm.world.json"), "utf8")) as unknown,
  readerFor(bareReal, "arm.world.json")
);
expect(
  bare.ok,
  `bare urdf compile: ${bare.ok ? "" : bare.errors.map((e) => e.code).join(",")}`
);
if (bare.ok) {
  expect(bare.index.bodyNames.includes("arm/base"), "bare urdf keeps base");
  expect(
    bare.index.bodyNames.includes("arm/upper_arm"),
    "bare urdf keeps upper_arm"
  );
  bare.model.delete();
  bare.vfs.delete();
}
rmSync(bareRoot, { recursive: true, force: true });

const worker = new Worker(worldWorkerEntry());
const fromWorker: FromWorker[] = [];
worker.on("message", (message: FromWorker) => {
  fromWorker.push(message);
});
worker.postMessage({
  type: "load",
  project: armDir,
  world: "arm.world.json",
  generation: 1,
} satisfies ToWorker);
await withTimeout(
  waitUntil(
    () => fromWorker.some((message) => message.type === "ready"),
    "worker ready",
    20000
  ),
  20000,
  "worker ready"
);
const ready = fromWorker.find((message) => message.type === "ready");
if (!ready || ready.type !== "ready") {
  throw new Error("worker did not become ready");
}
expect(ready.counts.nbody >= 3, `worker bodies ${ready.counts.nbody}`);
expect(ready.counts.njnt === 1, "worker joint count");
expect(ready.counts.nu === 1, "worker actuator count");
expect(ready.counts.nmesh === 2, "worker mesh count");
expect(
  ready.counts.actuatorNames.join(",") === "servo",
  "worker actuator name"
);
await waitUntil(
  () => fromWorker.some((message) => message.type === "state"),
  "initial state"
);
worker.postMessage({
  type: "setTarget",
  partId: "servo",
  radians: Math.PI / 2,
  generation: 1,
} satisfies ToWorker);
worker.postMessage({ type: "step", n: 2000, generation: 1 } satisfies ToWorker);
await withTimeout(
  waitUntil(
    () =>
      fromWorker.some(
        (message) => message.type === "state" && message.state.simTime > 1
      ),
    "stepped state",
    20000
  ),
  20000,
  "stepped state"
);
const stepped = fromWorker.find(
  (message) => message.type === "state" && message.state.simTime > 1
);
if (!stepped || stepped.type !== "state") {
  throw new Error("stepped state missing");
}
const shoulder = stepped.state.joints.arm?.shoulder ?? Number.NaN;
const shoulderDeg = deg(shoulder);
expect(
  Math.abs(shoulderDeg - 90) < 2,
  `shoulder ${shoulderDeg.toFixed(3)}° is within 2° of 90`
);
expect(
  stepped.state.simTime.toFixed(3) === "2.000",
  `simTime ${stepped.state.simTime}`
);
expect(stepped.state.playing === false, "step does not start play");
console.log(
  `arm step: shoulder ${shoulderDeg.toFixed(3)}° simTime ${stepped.state.simTime.toFixed(3)}s bodies ${index.nbody} joints ${index.njnt} actuators ${index.nu} meshes ${index.nmesh}`
);
const workerExit = new Promise<number>((resolve) => {
  worker.once("exit", (code) => resolve(code));
});
await worker.terminate();
await workerExit;

const shared = mkdtempSync(join(tmpdir(), "sfab-world-host-"));
cpSync(armDir, shared, { recursive: true });
const eventsA: WorldServerMessage[] = [];
const eventsB: WorldServerMessage[] = [];
let handleA: WorldHandle | null = null;
let handleB: WorldHandle | null = null;
try {
  const attachedA = await withTimeout(
    attachWorld(shared, "arm.world.json", {
      sender: { kind: "paired", label: "Headset A" },
      onEvent(event) {
        eventsA.push(event);
      },
    }),
    20000,
    "attach A"
  );
  if ("error" in attachedA) throw new Error(String(attachedA.error));
  handleA = attachedA;
  const attachedB = await withTimeout(
    attachWorld(shared, "arm.world.json", {
      sender: { kind: "paired", label: "Headset B" },
      onEvent(event) {
        eventsB.push(event);
      },
    }),
    20000,
    "attach B"
  );
  if ("error" in attachedB) throw new Error(String(attachedB.error));
  handleB = attachedB;
  expect(
    worldWorkerCount() === 1,
    `one worker while shared, saw ${worldWorkerCount()}`
  );
  const stateA = eventsA.find((event) => event.type === "state");
  const stateB = eventsB.find((event) => event.type === "state");
  expect(
    stateA?.type === "state" && stateB?.type === "state",
    "both got a state"
  );
  if (stateA?.type === "state" && stateB?.type === "state") {
    expect(stateA.state.simTime === stateB.state.simTime, "shared simTime");
    expect(
      stateA.state.playing === false && stateB.state.playing === false,
      "starts paused"
    );
  }
  const markA = eventsA.length;
  const markB = eventsB.length;
  handleA.pause();
  await waitUntil(
    () =>
      eventsB.some(
        (event) => event.type === "command" && event.command === "pause"
      ),
    "pause seen by B"
  );
  const pause = eventsB.find((event) => event.type === "command");
  expect(pause?.type === "command", "B saw a command");
  if (pause?.type === "command") {
    expect(pause.command === "pause", "command is pause");
    expect(pause.by.kind === "paired", `sender kind ${pause.by.kind}`);
    expect(
      pause.by.kind === "paired" && pause.by.label === "Headset A",
      "sender is A"
    );
  }
  handleA.step(10);
  const sawStep = (events: WorldServerMessage[], from: number) =>
    events
      .slice(from)
      .some((event) => event.type === "state" && event.state.simTime > 0);
  await waitUntil(() => sawStep(eventsA, markA), "A saw the step");
  await waitUntil(() => sawStep(eventsB, markB), "B saw the step");
  const seqA = eventsA.slice(markA).filter((event) => event.type === "state");
  const seqB = eventsB.slice(markB).filter((event) => event.type === "state");
  expect(
    seqA.length > 0 && seqA.length === seqB.length,
    `state sequence length ${seqA.length} vs ${seqB.length}`
  );
  expect(
    JSON.stringify(seqA) === JSON.stringify(seqB),
    "subscribers saw the same states"
  );

  const beforeReload = eventsB.length;
  writeFileSync(
    join(shared, "arm.world.json"),
    readFileSync(join(shared, "arm.world.json"))
  );
  await waitUntil(() => {
    const slice = eventsB.slice(beforeReload);
    const reloadedAt = slice.findIndex((event) => event.type === "reloaded");
    if (reloadedAt < 0) return false;
    return slice.slice(reloadedAt).some((event) => event.type === "state");
  }, "state after reload");
  const slice = eventsB.slice(beforeReload);
  const reloadedAt = slice.findIndex((event) => event.type === "reloaded");
  const after = slice.slice(reloadedAt).find((event) => event.type === "state");
  expect(after?.type === "state", "state after reload");
  if (after?.type === "state") {
    expect(after.state.playing === false, "reload pauses");
    expect(after.state.simTime === 0, `reload simTime ${after.state.simTime}`);
  }
} finally {
  handleA?.detach();
  handleB?.detach();
  await stopWorld(shared, "arm.world.json");
  rmSync(shared, { recursive: true, force: true });
}
expect(worldWorkerCount() === 0, `worker leaked (${worldWorkerCount()})`);

const bad = mkdtempSync(join(tmpdir(), "sfab-world-bad-"));
try {
  cpSync(armDir, bad, { recursive: true });
  writeFileSync(
    join(bad, "robot/arm.urdf"),
    readFileSync(join(bad, "robot/arm.urdf"), "utf8").replaceAll(
      "meshes/base.stl",
      "meshes/base.3mf"
    )
  );
  const errors: WorldServerMessage[] = [];
  const attached = await withTimeout(
    attachWorld(bad, "arm.world.json", {
      sender: { kind: "agent" },
      onEvent(event) {
        errors.push(event);
      },
    }),
    20000,
    "attach bad world"
  );
  expect(!("error" in attached), "bad world still attaches");
  if (!("error" in attached)) attached.detach();
  const failure = errors.find((event) => event.type === "error");
  expect(failure?.type === "error", "bad world reports an error");
  if (failure?.type === "error") {
    expect(
      failure.errors.some((issue) => issue.code === "mesh-format"),
      `codes ${failure.errors.map((issue) => issue.code).join(",")}`
    );
  }
  expect(
    worldWorkerCount() === 0,
    `invalid world left a worker (${worldWorkerCount()})`
  );
  await stopWorld(bad, "arm.world.json");
  expect(worldWorkerCount() === 0, "stop leaves no worker");
} finally {
  rmSync(bad, { recursive: true, force: true });
}

const catalog = listProjectFiles(armDir);
expect(
  catalog.some(
    (file) => file.path === "arm.world.json" && file.kind === "world"
  ),
  "catalog lists the world"
);
expect(
  catalog.some(
    (file) => file.path === "arm-stall.world.json" && file.kind === "world"
  ),
  "catalog lists the stall world"
);
expect(
  !catalog.some((file) => file.path.endsWith(".stl")),
  "meshes are not documents"
);
expect(
  !catalog.some((file) => file.path.endsWith(".urdf")),
  "urdf is not a document"
);

const stl = await handleProjectFile(
  new Request("http://bench.local/api/files/robot/meshes/base.stl"),
  armDir
);
expect(stl.status === 200, `stl status ${stl.status}`);
expect(
  stl.headers.get("content-type") === "model/stl",
  `stl type ${stl.headers.get("content-type")}`
);
const worldFile = await handleProjectFile(
  new Request("http://bench.local/api/files/arm.world.json"),
  armDir
);
expect(worldFile.status === 200, "world json is served");
expect(
  worldFile.headers.get("content-type") === "application/json",
  "world json type"
);
const urdf = await handleProjectFile(
  new Request("http://bench.local/api/files/robot/arm.urdf"),
  armDir
);
expect(urdf.status === 200, "urdf is served");
expect(urdf.headers.get("content-type") === "application/xml", "urdf type");
const escaped = await handleProjectFile(
  new Request("http://bench.local/api/files/../package.json"),
  armDir
);
expect(escaped.status === 404, `escape status ${escaped.status}`);
const outside = await handleProjectFile(
  new Request("http://bench.local/api/files/firmware/hold/hold.hex"),
  armDir
);
expect(outside.status === 404, "hex is not a world asset");

console.log("world-runtime.selfcheck ok");
