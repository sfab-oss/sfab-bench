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
  faultWorld,
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
const keptCompiler = ensureMujocoCompiler(
  `<robot name="arm"><mujoco><compiler balanceinertia="true" fusestatic="true" meshdir="meshes"/></mujoco></robot>`
);
expect(
  keptCompiler.includes('balanceinertia="true"'),
  `balanceinertia survived: ${keptCompiler}`
);
expect(keptCompiler.includes('fusestatic="false"'), "fusestatic overridden");
expect(
  keptCompiler.includes('discardvisual="false"'),
  "discardvisual overridden"
);
expect(
  keptCompiler.includes('meshdir=""'),
  `meshdir overridden: ${keptCompiler}`
);
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
  handleA.pause("tab-a");
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
    expect(pause.nonce === "tab-a", "B receives A's nonce");
  }
  const eventsC: WorldServerMessage[] = [];
  const attachedC = await withTimeout(
    attachWorld(shared, "arm.world.json", {
      sender: { kind: "paired", label: "Headset C" },
      onEvent(event) {
        eventsC.push(event);
      },
    }),
    20000,
    "attach C"
  );
  if ("error" in attachedC) throw new Error(String(attachedC.error));
  const lateState = eventsC.findIndex((event) => event.type === "state");
  const lateCommand = eventsC.find((event) => event.type === "command");
  expect(lateState === 0, "late joiner gets state first");
  expect(lateCommand?.type === "command", "late joiner gets the last command");
  if (lateCommand?.type === "command") {
    expect(lateCommand.command === "pause", "late command is pause");
    expect(
      lateCommand.by.kind === "paired" && lateCommand.by.label === "Headset A",
      "late joiner learns A paused"
    );
    expect(lateCommand.nonce === "tab-a", "late joiner receives A's nonce");
  }
  attachedC.detach();
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

  handleA.play();
  await waitUntil(
    () =>
      eventsB.some((event) => event.type === "state" && event.state.playing),
    "B sees play"
  );
  const beforeStep = eventsB.length;
  handleA.step(5);
  await waitUntil(
    () =>
      eventsB
        .slice(beforeStep)
        .some((event) => event.type === "command" && event.command === "pause"),
    "step while playing pauses"
  );
  const stepPause = eventsB
    .slice(beforeStep)
    .find((event) => event.type === "command");
  expect(stepPause?.type === "command", "step broadcast a command");
  if (stepPause?.type === "command") {
    expect(stepPause.command === "pause", "step's command is pause");
    expect(
      stepPause.by.kind === "paired" && stepPause.by.label === "Headset A",
      "step pause names A"
    );
    expect(stepPause.nonce === undefined, "a step pause has no client nonce");
  }
  await waitUntil(
    () =>
      eventsB
        .slice(beforeStep)
        .some(
          (event) =>
            event.type === "state" &&
            !event.state.playing &&
            event.state.simTime > 0
        ),
    "step settled paused"
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

const faultRoot = mkdtempSync(join(tmpdir(), "sfab-world-fault-"));
cpSync(armDir, faultRoot, { recursive: true });
const faultEvents: WorldServerMessage[] = [];
let faultHandle: WorldHandle | null = null;
try {
  const attached = await withTimeout(
    attachWorld(faultRoot, "arm.world.json", {
      sender: { kind: "loopback", label: "Mac" },
      onEvent(event) {
        faultEvents.push(event);
      },
    }),
    20000,
    "attach fault world"
  );
  if ("error" in attached) throw new Error(String(attached.error));
  faultHandle = attached;
  expect(worldWorkerCount() === 1, "fault world has one worker");
  faultWorld(faultRoot, "arm.world.json");
  faultHandle.step(1);
  await waitUntil(
    () => faultEvents.some((event) => event.type === "error"),
    "step fault reaches the subscriber"
  );
  const fault = faultEvents.find((event) => event.type === "error");
  expect(fault?.type === "error", "subscriber got an error");
  if (fault?.type === "error") {
    expect(
      fault.message?.includes("injected step fault"),
      `fault message ${fault.message ?? ""}`
    );
  }
  expect(worldWorkerCount() === 1, "a caught step fault leaves the thread up");
  expect(process.exitCode == null, "the host process is still running");
  const lateFault: WorldServerMessage[] = [];
  const lateFaultAttach = await withTimeout(
    attachWorld(faultRoot, "arm.world.json", {
      sender: { kind: "paired", label: "Late" },
      onEvent(event) {
        lateFault.push(event);
      },
    }),
    20000,
    "attach after fault"
  );
  if ("error" in lateFaultAttach)
    throw new Error(String(lateFaultAttach.error));
  const lateFaultEvent = lateFault.find((event) => event.type === "error");
  expect(lateFaultEvent?.type === "error", "late joiner receives the fault");
  if (lateFaultEvent?.type === "error") {
    expect(
      lateFaultEvent.message?.includes("injected step fault"),
      `late fault message ${lateFaultEvent.message ?? ""}`
    );
  }
  console.log("late joiner after step fault: received injected step fault");
  lateFaultAttach.detach();
} finally {
  faultHandle?.detach();
  await stopWorld(faultRoot, "arm.world.json");
  rmSync(faultRoot, { recursive: true, force: true });
}
expect(worldWorkerCount() === 0, "fault world did not leak a worker");

const twoRoot = mkdtempSync(join(tmpdir(), "sfab-world-two-"));
cpSync(armDir, twoRoot, { recursive: true });
writeFileSync(
  join(twoRoot, "robot/crane.urdf"),
  `<?xml version="1.0"?>
<robot name="crane">
  <link name="stand">
    <inertial>
      <origin xyz="0 0 0.02" rpy="0 0 0"/>
      <mass value="0.05"/>
      <inertia ixx="0.00002" ixy="0" ixz="0" iyy="0.00002" iyz="0" izz="0.00002"/>
    </inertial>
    <visual>
      <geometry><box size="0.04 0.04 0.04"/></geometry>
    </visual>
  </link>
  <link name="box">
    <inertial>
      <origin xyz="0.05 0 0" rpy="0 0 0"/>
      <mass value="0.03"/>
      <inertia ixx="0.00001" ixy="0" ixz="0" iyy="0.00004" iyz="0" izz="0.00004"/>
    </inertial>
    <visual>
      <geometry>
        <mesh filename="meshes/base.stl" scale="0.001 0.001 0.001"/>
      </geometry>
    </visual>
  </link>
  <joint name="hinge" type="revolute">
    <parent link="stand"/>
    <child link="box"/>
    <origin xyz="0 0 0.04" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="0" upper="2.617993877991494" effort="0.18" velocity="10.472"/>
    <dynamics damping="0.001" friction="0"/>
  </joint>
</robot>
`
);
const twoWorld = JSON.parse(
  readFileSync(join(twoRoot, "arm.world.json"), "utf8")
) as {
  robots: { id: string; urdf: string; pose: unknown }[];
  parts: {
    id: string;
    model: string;
    drives?: { robot: string; joint: string };
  }[];
};
twoWorld.robots.push({
  id: "crane",
  urdf: "robot/crane.urdf",
  pose: { position: [0.3, 0, 0], rotation: [1, 0, 0, 0] },
});
twoWorld.parts.push({
  id: "elbow",
  model: "sg90",
  drives: { robot: "crane", joint: "hinge" },
});
writeFileSync(join(twoRoot, "arm.world.json"), JSON.stringify(twoWorld));
const twoWorker = new Worker(worldWorkerEntry());
const twoMessages: FromWorker[] = [];
twoWorker.on("message", (message: FromWorker) => {
  twoMessages.push(message);
});
try {
  twoWorker.postMessage({
    type: "load",
    project: twoRoot,
    world: "arm.world.json",
    generation: 1,
  } satisfies ToWorker);
  await withTimeout(
    waitUntil(
      () => twoMessages.some((message) => message.type === "ready"),
      "two-robot ready",
      20000
    ),
    20000,
    "two-robot ready"
  );
  const twoReady = twoMessages.find((message) => message.type === "ready");
  if (!twoReady || twoReady.type !== "ready") {
    throw new Error("two-robot world did not become ready");
  }
  const bodies = twoReady.counts.bodyNames;
  for (const name of [
    "arm/base",
    "arm/upper_arm",
    "crane/stand",
    "crane/box",
  ]) {
    expect(bodies.includes(name), `${name} missing from ${bodies.join(",")}`);
  }
  expect(
    !bodies.some((name) => name.startsWith("arm/") && name.endsWith("box")),
    "arm did not take the crane link"
  );
  expect(
    !bodies.some((name) => name.startsWith("crane/") && name.endsWith("base")),
    "crane did not take the arm link"
  );
  expect(
    twoReady.counts.actuatorNames.includes("servo") &&
      twoReady.counts.actuatorNames.includes("elbow"),
    `actuators ${twoReady.counts.actuatorNames.join(",")}`
  );
  const jointOf = (robot: string, joint: string) => {
    const hit = [...twoMessages]
      .reverse()
      .find((message) => message.type === "state");
    if (!hit || hit.type !== "state") return Number.NaN;
    return hit.state.joints[robot]?.[joint] ?? Number.NaN;
  };
  twoWorker.postMessage({
    type: "setTarget",
    partId: "elbow",
    radians: Math.PI / 2,
    generation: 1,
  } satisfies ToWorker);
  twoWorker.postMessage({
    type: "step",
    n: 2000,
    generation: 1,
  } satisfies ToWorker);
  await withTimeout(
    waitUntil(
      () => {
        const hit = [...twoMessages]
          .reverse()
          .find((message) => message.type === "state");
        return hit?.type === "state" && hit.state.simTime > 1;
      },
      "crane stepped",
      20000
    ),
    20000,
    "crane stepped"
  );
  const hingeOnly = deg(jointOf("crane", "hinge"));
  const shoulderStill = deg(jointOf("arm", "shoulder"));
  expect(
    Math.abs(hingeOnly - 90) < 2,
    `crane hinge ${hingeOnly.toFixed(3)}° after its own target`
  );
  expect(
    Math.abs(shoulderStill) < 2,
    `arm shoulder ${shoulderStill.toFixed(3)}° moved with the crane`
  );
  twoWorker.postMessage({
    type: "setTarget",
    partId: "servo",
    radians: Math.PI / 2,
    generation: 1,
  } satisfies ToWorker);
  twoWorker.postMessage({
    type: "step",
    n: 2000,
    generation: 1,
  } satisfies ToWorker);
  await withTimeout(
    waitUntil(
      () => {
        const hit = [...twoMessages]
          .reverse()
          .find((message) => message.type === "state");
        return (
          hit?.type === "state" && hit.state.simTime > 3 && !hit.state.playing
        );
      },
      "both robots stepped",
      20000
    ),
    20000,
    "both robots stepped"
  );
  const shoulderMoved = deg(jointOf("arm", "shoulder"));
  const hingeHeld = deg(jointOf("crane", "hinge"));
  expect(
    Math.abs(shoulderMoved - 90) < 2,
    `arm shoulder ${shoulderMoved.toFixed(3)}° after its own target`
  );
  expect(
    Math.abs(hingeHeld - 90) < 2,
    `crane hinge ${hingeHeld.toFixed(3)}° moved with the arm`
  );
  console.log(
    `two robots: hinge ${hingeOnly.toFixed(3)}° shoulder ${shoulderStill.toFixed(3)}° then shoulder ${shoulderMoved.toFixed(3)}° hinge ${hingeHeld.toFixed(3)}°`
  );
} finally {
  const twoExit = new Promise<number>((resolve) => {
    twoWorker.once("exit", (code) => resolve(code));
  });
  await twoWorker.terminate();
  await twoExit;
  rmSync(twoRoot, { recursive: true, force: true });
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
