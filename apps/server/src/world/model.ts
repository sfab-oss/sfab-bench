import type { MainModule, MjModel, MjSpec, MjVFS } from "@mujoco/mujoco";
import {
  extractUrdfJointsAndMeshes,
  partModel,
  resolveUrdfMesh,
  validateWorld,
  type WorldDocument,
  type WorldError,
  type WorldPose,
  type WorldPrimitive,
  type WorldValidateCtx,
} from "@sfab-bench/contract";

import type { WorldBytes } from "./files";

/**
 * Position gains that track the slewed SG90 setpoint on the fixture arm.
 * Implicit integration, so this damping does not fight the 1 ms step.
 * No control filter: the part-model slew is already the rate limit.
 * Hold sketch, the 10° → 90° move: overshoot 0.054°, within 1° at
 * 101 ms after the slew ended. Torque starts at the part model's
 * 0.176 N·m, on both the actuator range and the joint actuator-force
 * range. Each step replaces both with V / V_nom.
 */
const SERVO_KP = 0.8;
const SERVO_KV = 0.03;

const TIMESTEP_S = 0.001;

/**
 * MuJoCo's default limit solref is `[0.02, 1]`. At the 1 ms step that
 * rests about 1.4° past a stop and peaks about 5° when the servo hits it
 * at full torque. `[0.002, 1]` is the stiffest pair the solver allows
 * (timeconst ≥ 2 × timestep) and measured 0.025° at rest, 0.70° at the
 * peak. MuJoCo 3.14's URDF reader ignores a joint `<mujoco>`
 * `solreflimit`, so this pass applies that attribute when the URDF
 * has one and otherwise writes this pair. The time constant is never
 * set below 2 × timestep.
 */
export const JOINT_LIMIT_SOLREF: readonly [number, number] = [0.002, 1];
const MUJOCO_LIMIT_SOLREF: readonly [number, number] = [0.02, 1];

export type WorldModelCounts = {
  nbody: number;
  njnt: number;
  nu: number;
  nmesh: number;
  bodyNames: string[];
  jointNames: string[];
  actuatorNames: string[];
  meshNames: string[];
  geomNames: string[];
};

export type WorldModelIndex = WorldModelCounts & {
  /** robot id → link name → body id. */
  links: Record<string, Record<string, number>>;
  /** robot id → joint name → qpos address. */
  joints: Record<string, Record<string, number>>;
  /** part id → actuator id. The actuator's MuJoCo name is the part id. */
  parts: Record<string, number>;
  /** MuJoCo body name for each link, so the stepper does not rebuild it. */
  linkNames: Record<string, Record<string, string>>;
  jointNamesByRobot: Record<string, Record<string, string>>;
};

export type CompiledWorld = {
  ok: true;
  mj: MainModule;
  model: MjModel;
  /** Mesh bytes live here until the model is finished with them. */
  vfs: MjVFS;
  index: WorldModelIndex;
};

export type CompileFailure = { ok: false; errors: WorldError[] };

let mujocoModule: Promise<MainModule> | null = null;

function mujoco(): Promise<MainModule> {
  if (!mujocoModule) {
    mujocoModule = import("@mujoco/mujoco")
      .then((mod) => mod.default())
      .catch((err: unknown) => {
        mujocoModule = null;
        throw err;
      });
  }
  return mujocoModule;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function schemaError(message: string): WorldError {
  const text = message.includes("Hint:")
    ? message
    : `${message} Hint: check the world file and the URDF.`;
  return { code: "schema", path: "", message: text };
}

function ctxFor(files: WorldBytes): WorldValidateCtx {
  return {
    fileExists(relativePath) {
      return files.read(relativePath) !== null;
    },
    urdf(relativePath) {
      const bytes = files.read(relativePath);
      if (!bytes) return undefined;
      return extractUrdfJointsAndMeshes(decode(bytes));
    },
  };
}

const COMPILER_FORCED: ReadonlyArray<readonly [string, string]> = [
  ["fusestatic", "false"],
  ["discardvisual", "false"],
  // Empty so a URDF meshdir does not prefix the VFS paths we write.
  ["meshdir", ""],
];

/** Keep every other attribute. Force the three MuJoCo flags this runtime needs. */
function forceCompilerAttrs(attrs: string): string {
  let next = attrs.replace(/\/\s*$/, "");
  for (const [name, value] of COMPILER_FORCED) {
    const re = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*')`, "i");
    if (re.test(next)) next = next.replace(re, `${name}="${value}"`);
    else next += ` ${name}="${value}"`;
  }
  return `<compiler${next}/>`;
}

/**
 * MuJoCo's URDF compiler fuses a static base into the world unless
 * `fusestatic` is false, and it drops visual meshes when `discardvisual`
 * is true. Inject the element when the URDF has none, and force those
 * flags (and `meshdir`) without dropping the rest of the compiler tag.
 */
export function ensureMujocoCompiler(xml: string): string {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const compiler = forceCompilerAttrs("");
  if (!/<mujoco\b/i.test(stripped)) {
    return stripped.replace(
      /<robot\b[^>]*>/i,
      (open) => `${open}<mujoco>${compiler}</mujoco>`
    );
  }
  if (!/<compiler\b/i.test(stripped)) {
    return stripped.replace(/<mujoco\b[^>]*>/i, (open) => `${open}${compiler}`);
  }
  return stripped.replace(/<compiler\b([^>]*)>/i, (_full, attrs: string) =>
    forceCompilerAttrs(attrs)
  );
}

function retargetMeshes(
  xml: string,
  robotId: string
): { xml: string; meshes: { written: string; vfs: string }[] } {
  const meshes: { written: string; vfs: string }[] = [];
  const next = xml.replace(/<mesh\b([^>]*?)(\/?)>/gi, (full, attrs: string) => {
    const match = /filename\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!match) return full;
    const written = match[1] ?? match[2] ?? "";
    const vfs = `${robotId}/${written}`.replace(/\/{2,}/g, "/");
    meshes.push({ written, vfs });
    const replaced = attrs.replace(
      /filename\s*=\s*(?:"[^"]*"|'[^']*')/i,
      `filename="${vfs}"`
    );
    const close = full.trimEnd().endsWith("/>") ? "/>" : ">";
    return `<mesh${replaced}${close}`;
  });
  return { xml: next, meshes };
}

function nums(values: readonly number[]): string {
  return values.map((n) => String(n)).join(" ");
}

function poseAttrs(pose: WorldPose): string {
  return `pos="${nums(pose.position)}" quat="${nums(pose.rotation)}"`;
}

function primitiveGeom(primitive: WorldPrimitive): string {
  const pose = poseAttrs(primitive.pose);
  const name = `name="${primitive.id}"`;
  if (primitive.shape === "box") {
    const half = primitive.size.map((n) => n / 2);
    return `<geom ${name} type="box" size="${nums(half)}" ${pose}/>`;
  }
  if (primitive.shape === "sphere") {
    return `<geom ${name} type="sphere" size="${primitive.size}" ${pose}/>`;
  }
  const halfLength = primitive.size.length / 2;
  return `<geom ${name} type="cylinder" size="${primitive.size.radius} ${halfLength}" ${pose}/>`;
}

function worldXml(doc: WorldDocument): string {
  const geoms: string[] = [];
  if (doc.environment.ground.plane) {
    geoms.push('<geom name="ground" type="plane" size="2 2 0.1"/>');
  }
  for (const primitive of doc.environment.primitives ?? []) {
    geoms.push(primitiveGeom(primitive));
  }
  const mounts = doc.robots
    .map((robot) => {
      return `<body name="pose_${robot.id}" ${poseAttrs(robot.pose)}/>`;
    })
    .join("");
  return `<mujoco model="world">
    <option timestep="${TIMESTEP_S}" gravity="0 0 -9.81" integrator="implicitfast"/>
    <worldbody>
      ${geoms.join("\n")}
      ${mounts}
    </worldbody>
  </mujoco>`;
}

function namesOf(
  mj: MainModule,
  model: MjModel,
  count: number,
  obj: number
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(mj.mj_id2name(model, obj, i) ?? "");
  return out;
}

function readNum(value: Int32Array, index: number): number {
  return value[index] ?? Number.NaN;
}

/**
 * The catalog `torqueNm` is the joint's actuator-force clamp. MuJoCo
 * clips `qfrc_actuator` to `jnt_actfrcrange` after the actuator range,
 * and the URDF `effort` placeholder is what was binding (0.18 N·m on
 * the fixture arm, above the SG90's 0.176).
 */
function applyServoTorqueClamp(
  mj: MainModule,
  model: MjModel,
  doc: WorldDocument
) {
  const range = model.jnt_actfrcrange as Float64Array;
  const trnid = model.actuator_trnid as Int32Array;
  const actuatorType = mj.mjtObj.mjOBJ_ACTUATOR.value;
  for (const part of doc.parts) {
    if (!part.drives) continue;
    const spec = partModel(part.model);
    const torque = spec?.drive.kind === "servo" ? spec.torqueNm : undefined;
    if (torque === undefined || !(torque > 0)) continue;
    const actId = mj.mj_name2id(model, actuatorType, part.id);
    if (actId < 0) continue;
    const jointId = trnid[actId * 2] ?? -1;
    if (jointId < 0) continue;
    range[jointId * 2] = -torque;
    range[jointId * 2 + 1] = torque;
  }
}

/**
 * `solreflimit` on a joint's `<mujoco>` child. MuJoCo's URDF compiler
 * does not read it. Keys are URDF joint names.
 */
function urdfSolrefLimits(xml: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const jointRe = /<joint\b([^>]*)>([\s\S]*?)<\/joint>/gi;
  for (const match of stripped.matchAll(jointRe)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const name = /(?:^|\s)name\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const sol = /solreflimit\s*=\s*"([^"]+)"/i.exec(body)?.[1];
    if (!name || !sol || !/<mujoco\b/i.test(body)) continue;
    const nums = sol.trim().split(/\s+/).map(Number);
    const timeconst = nums[0];
    const dampratio = nums[1];
    if (
      timeconst === undefined ||
      dampratio === undefined ||
      !Number.isFinite(timeconst) ||
      !Number.isFinite(dampratio)
    ) {
      continue;
    }
    out.set(name, [timeconst, dampratio]);
  }
  return out;
}

function urdfLimitSolref(
  doc: WorldDocument,
  files: WorldBytes
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const robot of doc.robots) {
    const raw = files.read(robot.urdf);
    if (!raw) continue;
    for (const [name, pair] of urdfSolrefLimits(decode(raw))) {
      out.set(`${robot.id}/${name}`, pair);
    }
  }
  return out;
}

/** Stiffen limited joints. An authored URDF `solreflimit` wins. */
function applyLimitSolref(
  mj: MainModule,
  model: MjModel,
  authored: Map<string, [number, number]>
) {
  const solref = model.jnt_solref as Float64Array;
  const limits = model.jnt_range as Float64Array;
  const stride = model.njnt > 0 ? solref.length / model.njnt : 0;
  if (stride < 2) return;
  const jointType = mj.mjtObj.mjOBJ_JOINT.value;
  const minTimeconst = 2 * TIMESTEP_S;
  for (let joint = 0; joint < model.njnt; joint++) {
    const lower = limits[joint * 2] ?? 0;
    const upper = limits[joint * 2 + 1] ?? 0;
    if (!(upper > lower)) continue;
    const base = joint * stride;
    const name = mj.mj_id2name(model, jointType, joint) ?? "";
    const fromUrdf = authored.get(name);
    if (fromUrdf) {
      const timeconst = fromUrdf[0];
      solref[base] =
        timeconst > 0 ? Math.max(timeconst, minTimeconst) : timeconst;
      solref[base + 1] = fromUrdf[1];
      continue;
    }
    const timeconst = solref[base] ?? 0;
    const dampratio = solref[base + 1] ?? 0;
    if (
      Math.abs(timeconst - MUJOCO_LIMIT_SOLREF[0]) > 1e-9 ||
      Math.abs(dampratio - MUJOCO_LIMIT_SOLREF[1]) > 1e-9
    ) {
      continue;
    }
    solref[base] = JOINT_LIMIT_SOLREF[0];
    solref[base + 1] = JOINT_LIMIT_SOLREF[1];
  }
}

function addBuffer(vfs: MjVFS, name: string, bytes: Uint8Array) {
  vfs.addBuffer(name, Array.from(bytes));
}

function forceCompiler(spec: MjSpec) {
  spec.compiler.fusestatic = false;
  spec.compiler.discardvisual = false;
}

/**
 * Validate `doc`, then compile one MuJoCo model: ground, primitives, and
 * each robot attached at its pose. A part that drives a joint gets a
 * position actuator named with the part id.
 */
export async function compileWorld(
  doc: unknown,
  files: WorldBytes
): Promise<CompiledWorld | CompileFailure> {
  const validation = validateWorld(doc, ctxFor(files));
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const worldDoc = doc as WorldDocument;
  const mj = await mujoco();
  const vfs = new mj.MjVFS();
  const robotSpecs: MjSpec[] = [];
  let world: MjSpec | null = null;
  let model: MjModel | null = null;
  let returned = false;
  const release = (obj: { delete: () => void } | null) => {
    if (!obj) return;
    try {
      obj.delete();
    } catch {
      /* already freed */
    }
  };
  try {
    for (const robot of worldDoc.robots) {
      const raw = files.read(robot.urdf);
      if (!raw) {
        return {
          ok: false,
          errors: [
            schemaError(
              `URDF "${robot.urdf}" disappeared while the model was building.`
            ),
          ],
        };
      }
      const prepared = ensureMujocoCompiler(decode(raw));
      const retargeted = retargetMeshes(prepared, robot.id);
      for (const mesh of retargeted.meshes) {
        const rel = resolveUrdfMesh(robot.urdf, mesh.written);
        const bytes = rel ? files.read(rel) : null;
        if (!bytes) {
          return {
            ok: false,
            errors: [
              {
                code: "missing-file",
                path: "",
                message: `Mesh "${mesh.written}" does not exist. Hint: the path is relative to the URDF.`,
              },
            ],
          };
        }
        addBuffer(vfs, mesh.vfs, bytes);
      }
      const spec = mj.parseXMLString(retargeted.xml, vfs);
      // Register before the parse-error return so `finally` frees it.
      robotSpecs.push(spec);
      const parseError = mj.mjs_getError(spec);
      if (parseError) return { ok: false, errors: [schemaError(parseError)] };
      forceCompiler(spec);
    }

    const scene = mj.parseXMLString(worldXml(worldDoc));
    world = scene;
    const worldError = mj.mjs_getError(scene);
    if (worldError) return { ok: false, errors: [schemaError(worldError)] };
    forceCompiler(scene);
    scene.option.timestep = TIMESTEP_S;
    scene.option.integrator = mj.mjtIntegrator.mjINT_IMPLICITFAST
      .value as unknown as typeof scene.option.integrator;

    worldDoc.robots.forEach((robot, i) => {
      const spec = robotSpecs[i];
      if (!spec) return;
      const mount = mj.mjs_findBody(scene, `pose_${robot.id}`);
      if (!mount) {
        throw new Error(`mount for ${robot.id} is missing`);
      }
      const attached = mj.mjs_attach(
        mount.element,
        spec.element,
        `${robot.id}/`,
        ""
      );
      if (!attached) {
        throw new Error(
          mj.mjs_getError(scene) || `could not attach ${robot.id}`
        );
      }
    });

    for (const part of worldDoc.parts) {
      if (!part.drives) continue;
      const model = partModel(part.model);
      if (model?.drive.kind !== "servo") continue;
      const defaults = mj.mjs_getSpecDefault(scene);
      if (!defaults) throw new Error("MuJoCo spec has no default");
      const actuator = mj.mjs_addActuator(world, defaults);
      if (!actuator) {
        throw new Error(mj.mjs_getError(scene) || "could not add an actuator");
      }
      mj.mjs_setName(actuator.element, part.id);
      actuator.trntype = mj.mjtTrn.mjTRN_JOINT
        .value as unknown as typeof actuator.trntype;
      actuator.target = `${part.drives.robot}/${part.drives.joint}`;
      // Position servo, no filter, ctrl not clipped to the joint range
      // (a 180° command pushes into the limit). The binding has no null
      // pointer, so dampratio is passed as 0 and kv is written after:
      // a zero dampratio would otherwise clear the damping term.
      const setErr = mj.mjs_setToPosition(
        actuator,
        SERVO_KP,
        new Float64Array([SERVO_KV]),
        new Float64Array([0]),
        new Float64Array([0]),
        0
      );
      if (setErr) throw new Error(setErr);
      const bias = actuator.biasprm as Float64Array;
      bias[2] = -SERVO_KV;
      const torque = model.torqueNm;
      if (torque !== undefined && torque > 0) {
        actuator.forcelimited = mj.mjtLimited.mjLIMITED_TRUE
          .value as unknown as typeof actuator.forcelimited;
        const range = actuator.forcerange as Float64Array;
        range[0] = -torque;
        range[1] = torque;
      }
    }

    try {
      model = mj.mj_compile(scene, vfs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errors: [schemaError(message)] };
    }
    if (!model) {
      return {
        ok: false,
        errors: [schemaError(mj.mjs_getError(scene) || "mj_compile failed")],
      };
    }
    // URDF `effort` becomes `jnt_actfrcrange` and that clamp binds above
    // the actuator's own forcerange. A servo joint uses the catalog
    // torque instead. The step loop then scales the same range by V/V_nom.
    applyServoTorqueClamp(mj, model, worldDoc);
    applyLimitSolref(mj, model, urdfLimitSolref(worldDoc, files));

    const bodyType = mj.mjtObj.mjOBJ_BODY.value;
    const jointType = mj.mjtObj.mjOBJ_JOINT.value;
    const actuatorType = mj.mjtObj.mjOBJ_ACTUATOR.value;
    const meshType = mj.mjtObj.mjOBJ_MESH.value;
    const geomType = mj.mjtObj.mjOBJ_GEOM.value;
    const index: WorldModelIndex = {
      nbody: model.nbody,
      njnt: model.njnt,
      nu: model.nu,
      nmesh: model.nmesh,
      bodyNames: namesOf(mj, model, model.nbody, bodyType),
      jointNames: namesOf(mj, model, model.njnt, jointType),
      actuatorNames: namesOf(mj, model, model.nu, actuatorType),
      meshNames: namesOf(mj, model, model.nmesh, meshType),
      geomNames: namesOf(mj, model, model.ngeom, geomType),
      links: {},
      joints: {},
      parts: {},
      linkNames: {},
      jointNamesByRobot: {},
    };

    for (const robot of worldDoc.robots) {
      const raw = files.read(robot.urdf);
      if (!raw) continue;
      const info = extractUrdfJointsAndMeshes(decode(raw));
      const links: Record<string, number> = {};
      const linkMj: Record<string, string> = {};
      for (const link of info.links) {
        const mjName = `${robot.id}/${link}`;
        const id = mj.mj_name2id(model, bodyType, mjName);
        if (id < 0) {
          return {
            ok: false,
            errors: [
              schemaError(
                `Robot "${robot.id}" has no body for link "${link}" after compile.`
              ),
            ],
          };
        }
        links[link] = id;
        linkMj[link] = mjName;
      }
      index.links[robot.id] = links;
      index.linkNames[robot.id] = linkMj;

      const joints: Record<string, number> = {};
      const jointMj: Record<string, string> = {};
      for (const joint of info.joints) {
        const mjName = `${robot.id}/${joint}`;
        const id = mj.mj_name2id(model, jointType, mjName);
        if (id < 0) {
          return {
            ok: false,
            errors: [
              schemaError(
                `Robot "${robot.id}" has no joint "${joint}" after compile.`
              ),
            ],
          };
        }
        const qpos = readNum(model.jnt_qposadr as Int32Array, id);
        if (!Number.isFinite(qpos)) {
          return {
            ok: false,
            errors: [schemaError(`Joint "${joint}" has no qpos address.`)],
          };
        }
        joints[joint] = qpos;
        jointMj[joint] = mjName;
      }
      index.joints[robot.id] = joints;
      index.jointNamesByRobot[robot.id] = jointMj;
    }

    for (const part of worldDoc.parts) {
      if (!part.drives) continue;
      const id = mj.mj_name2id(model, actuatorType, part.id);
      if (id < 0) {
        return {
          ok: false,
          errors: [schemaError(`Part "${part.id}" has no actuator.`)],
        };
      }
      index.parts[part.id] = id;
    }

    for (const spec of robotSpecs) release(spec);
    robotSpecs.length = 0;
    release(world);
    world = null;
    returned = true;
    return { ok: true, mj, model, vfs, index };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [schemaError(message)] };
  } finally {
    if (!returned) {
      release(model);
      release(world);
      for (const spec of robotSpecs) release(spec);
      release(vfs);
    }
  }
}
