import type { MainModule, MjModel, MjSpec, MjVFS } from "@mujoco/mujoco";
import {
  extractUrdfJointsAndMeshes,
  partModel,
  validateWorld,
  type WorldDocument,
  type WorldError,
  type WorldPose,
  type WorldPrimitive,
  type WorldValidateCtx,
} from "@sfab-bench/contract";

import type { WorldBytes } from "./files";

/**
 * Position-servo gains from the P2 probe. A 90° step overshoots on the way
 * and is within a degree of the target at 2 s. W4 tunes them; leave them.
 */
const SERVO_KP = 4;
const SERVO_KV = 0.2;
const SERVO_DAMP_RATIO = 1;
const SERVO_TIMECONST = 0.1;
const SERVO_INHERIT_RANGE = 1;

const TIMESTEP_S = 0.001;

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

function linkNames(xml: string): string[] {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const names: string[] = [];
  for (const tag of stripped.matchAll(/<link\b([^>]*)>/g)) {
    const attrs = tag[1] ?? "";
    const match = /(?:^|\s)name\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs);
    const name = match?.[1] ?? match?.[2];
    if (name) names.push(name);
  }
  return names;
}

/**
 * MuJoCo's URDF compiler fuses a static base into the world unless
 * `fusestatic` is false, and it drops visual meshes when `discardvisual`
 * is true. Inject the element when the URDF has none, and force both
 * flags false when it has something else.
 */
export function ensureMujocoCompiler(xml: string): string {
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");
  const compiler = '<compiler fusestatic="false" discardvisual="false"/>';
  if (!/<mujoco\b/i.test(stripped)) {
    return stripped.replace(
      /<robot\b[^>]*>/i,
      (open) => `${open}<mujoco>${compiler}</mujoco>`
    );
  }
  if (!/<compiler\b/i.test(stripped)) {
    return stripped.replace(/<mujoco\b[^>]*>/i, (open) => `${open}${compiler}`);
  }
  return stripped.replace(
    /<compiler\b[^>]*>/i,
    '<compiler fusestatic="false" discardvisual="false"/>'
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
    <option timestep="${TIMESTEP_S}" gravity="0 0 -9.81"/>
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

function readNum(value: unknown, index: number): number {
  if (typeof value === "number") return index === 0 ? value : Number.NaN;
  if (ArrayBuffer.isView(value)) {
    return Number((value as unknown as ArrayLike<number>)[index]);
  }
  if (value && typeof value === "object") {
    const got = (value as { get?: (i: number) => unknown }).get?.(index);
    if (typeof got === "number") return got;
    const indexed = (value as Record<number, unknown>)[index];
    if (typeof indexed === "number") return indexed;
  }
  return Number.NaN;
}

function meshProjectPath(urdfRel: string, mesh: string): string | null {
  const slash = urdfRel.lastIndexOf("/");
  const dir = slash === -1 ? "" : urdfRel.slice(0, slash);
  const parts: string[] = [];
  for (const part of `${dir}/${mesh}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return parts.join("/");
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
        const rel = meshProjectPath(robot.urdf, mesh.written);
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
      const parseError = mj.mjs_getError(spec);
      if (parseError) {
        spec.delete();
        return { ok: false, errors: [schemaError(parseError)] };
      }
      forceCompiler(spec);
      robotSpecs.push(spec);
    }

    const world = mj.parseXMLString(worldXml(worldDoc));
    const worldError = mj.mjs_getError(world);
    if (worldError) {
      world.delete();
      return { ok: false, errors: [schemaError(worldError)] };
    }
    forceCompiler(world);
    world.option.timestep = TIMESTEP_S;

    worldDoc.robots.forEach((robot, i) => {
      const spec = robotSpecs[i];
      if (!spec) return;
      const mount = mj.mjs_findBody(world, `pose_${robot.id}`);
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
          mj.mjs_getError(world) || `could not attach ${robot.id}`
        );
      }
    });

    for (const part of worldDoc.parts) {
      if (!part.drives) continue;
      const model = partModel(part.model);
      if (model?.drive.kind !== "servo") continue;
      const defaults = mj.mjs_getSpecDefault(world);
      if (!defaults) throw new Error("MuJoCo spec has no default");
      const actuator = mj.mjs_addActuator(world, defaults);
      if (!actuator) {
        throw new Error(mj.mjs_getError(world) || "could not add an actuator");
      }
      mj.mjs_setName(actuator.element, part.id);
      actuator.trntype = mj.mjtTrn.mjTRN_JOINT
        .value as unknown as typeof actuator.trntype;
      actuator.target = `${part.drives.robot}/${part.drives.joint}`;
      const setErr = mj.mjs_setToPosition(
        actuator,
        SERVO_KP,
        new Float64Array([SERVO_KV]),
        new Float64Array([SERVO_DAMP_RATIO]),
        new Float64Array([SERVO_TIMECONST]),
        SERVO_INHERIT_RANGE
      );
      if (setErr) throw new Error(setErr);
    }

    let model: MjModel | undefined;
    try {
      model = mj.mj_compile(world, vfs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errors: [schemaError(message)] };
    }
    if (!model) {
      return {
        ok: false,
        errors: [schemaError(mj.mjs_getError(world) || "mj_compile failed")],
      };
    }

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
      const links: Record<string, number> = {};
      const linkMj: Record<string, string> = {};
      for (const link of linkNames(decode(raw))) {
        const mjName = `${robot.id}/${link}`;
        const id = mj.mj_name2id(model, bodyType, mjName);
        if (id < 0) {
          model.delete();
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
      const info = extractUrdfJointsAndMeshes(decode(raw));
      for (const joint of info.joints) {
        const mjName = `${robot.id}/${joint}`;
        const id = mj.mj_name2id(model, jointType, mjName);
        if (id < 0) {
          model.delete();
          return {
            ok: false,
            errors: [
              schemaError(
                `Robot "${robot.id}" has no joint "${joint}" after compile.`
              ),
            ],
          };
        }
        const qpos = readNum(model.jnt_qposadr, id);
        if (!Number.isFinite(qpos)) {
          model.delete();
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
        model.delete();
        return {
          ok: false,
          errors: [schemaError(`Part "${part.id}" has no actuator.`)],
        };
      }
      index.parts[part.id] = id;
    }

    for (const spec of robotSpecs) spec.delete();
    world.delete();
    return { ok: true, mj, model, vfs, index };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [schemaError(message)] };
  }
}
