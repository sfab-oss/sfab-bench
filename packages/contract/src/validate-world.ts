/**
 * `validateWorld` checks a `.world.json` document. It does no file IO.
 * The caller reports whether a relative path exists and, for each robot
 * URDF it has read, the joint names and mesh filenames from
 * `extractUrdfJointsAndMeshes`. Mesh filenames are resolved relative to
 * that URDF and checked with `fileExists` too: a missing STL is
 * `missing-file` before MuJoCo opens it.
 *
 * Two-outputs, pin-kind, and signal-pin use the full wire net. Voltage
 * and missing-ground still walk only edges whose ends share a kind, so
 * a signal wire does not feed a supply.
 */

import { resolveUrdfMesh, type UrdfInfo } from "./urdf";
import {
  type BoardId,
  type BoardModel,
  boardModel,
  type ChipId,
  isBoardId,
  isChipId,
  isPartModelId,
  MILESTONE_SUPPLY_PRESET,
  PART_MODEL_IDS,
  type PartModelId,
  partModel,
  supplyPresets,
  WORLD_VERSION,
  type WorldDocument,
  type WorldDrives,
  type WorldEnvironment,
  type WorldPin,
  type WorldPose,
  type WorldPrimitive,
  type WorldQuat,
  type WorldRobot,
  type WorldStepProp,
  type WorldSupply,
  type WorldVec3,
  type WorldWire,
} from "./world";

export const WORLD_ERROR_CODES = [
  "schema",
  "missing-file",
  "mesh-format",
  "unknown-joint",
  "unknown-pin",
  "missing-ground",
  "voltage-mismatch",
  "two-outputs",
  "pin-kind",
  "signal-pin",
  "power-input",
  "pwm-pin",
] as const;

export const WORLD_WARNING_CODES = [
  "servo-pwm-conflict",
  "duplicate-mesh-basename",
] as const;

export type WorldErrorCode = (typeof WORLD_ERROR_CODES)[number];
export type WorldWarningCode = (typeof WORLD_WARNING_CODES)[number];

export type WorldError = {
  code: WorldErrorCode;
  /** Dotted JSON path. Empty when the value is not an object at all. */
  path: string;
  message: string;
};

export type WorldWarning = {
  code: WorldWarningCode;
  path: string;
  message: string;
};

export type WorldValidation = {
  ok: boolean;
  errors: WorldError[];
  warnings: WorldWarning[];
};

export type WorldValidateCtx = {
  /**
   * `relativePath` is relative to the world file. Mesh paths are not the
   * filename from the URDF: they are joined onto the URDF's directory first
   * (`resolveUrdfMesh`).
   */
  fileExists: (relativePath: string) => boolean;
  /**
   * Joints and mesh filenames for a URDF the caller has already read.
   * Undefined when the file is missing or the caller did not parse it.
   */
  urdf: (relativePath: string) => UrdfInfo | undefined;
};

const ROOT_KEYS = [
  "version",
  "robots",
  "environment",
  "boards",
  "supplies",
  "parts",
  "wires",
] as const;

const MESH_HINT = "export STL with $cad (`cadgen stl build`)";

const ENDPOINT = /^([A-Za-z_][A-Za-z0-9_-]*)\.([A-Za-z0-9+][A-Za-z0-9_+-]*)$/;

type Resolved = {
  endpoint: string;
  owner: "board" | "part" | "supply";
  id: string;
  pin: string;
  spec: WorldPin;
  board?: BoardModel;
};

type ResolveFail =
  | { fail: "instance"; id: string }
  | { fail: "no-pins"; id: string }
  | { fail: "pin"; id: string; pin: string; known: string };

type SupplyNode = {
  id: string;
  voltage: number;
  positive: string;
  ground: string;
};

function err(code: WorldErrorCode, path: string, message: string): WorldError {
  if (!message.includes("Hint:")) {
    throw new Error(`world issue missing hint: ${code} ${path}`);
  }
  return { code, path, message };
}

function warn(
  code: WorldWarningCode,
  path: string,
  message: string
): WorldWarning {
  if (!message.includes("Hint:")) {
    throw new Error(`world issue missing hint: ${code} ${path}`);
  }
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(
  path: string,
  obj: Record<string, unknown>,
  allowed: readonly string[],
  errors: WorldError[]
) {
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) continue;
    const at = path ? `${path}.${key}` : key;
    errors.push(
      err(
        "schema",
        at,
        `Unknown field "${key}". Hint: allowed fields are ${allowed.join(", ")}.`
      )
    );
  }
}

function parseId(
  value: unknown,
  path: string,
  errors: WorldError[]
): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    errors.push(
      err(
        "schema",
        path,
        'Id must start with a letter or underscore and contain only letters, digits, "_" or "-". Hint: wire endpoints are "<id>.<pin>", so an id cannot contain ".".'
      )
    );
    return undefined;
  }
  return value;
}

function parseVec3(
  value: unknown,
  path: string,
  errors: WorldError[],
  positive: boolean
): WorldVec3 | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    errors.push(
      err(
        "schema",
        path,
        "Expected three finite numbers [x, y, z] in metres. Hint: position and box size are arrays, not objects."
      )
    );
    return undefined;
  }
  const vec = value as WorldVec3;
  if (positive && vec.some((n) => n <= 0)) {
    errors.push(
      err(
        "schema",
        path,
        "Size components must be greater than 0. Hint: size is full extents in metres."
      )
    );
    return undefined;
  }
  return [vec[0], vec[1], vec[2]];
}

function parseQuat(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldQuat | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    errors.push(
      err(
        "schema",
        path,
        "Rotation must be a unit quaternion [w, x, y, z]. Hint: identity is [1, 0, 0, 0]."
      )
    );
    return undefined;
  }
  const quat = value as WorldQuat;
  const mag = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
  if (Math.abs(mag - 1) > 1e-3) {
    errors.push(
      err(
        "schema",
        path,
        "Rotation is not a unit quaternion. Hint: scalar first [w, x, y, z]; identity is [1, 0, 0, 0]."
      )
    );
    return undefined;
  }
  return [quat[0], quat[1], quat[2], quat[3]];
}

function parsePose(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldPose | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "Pose must be { position, rotation }. Hint: position is metres [x, y, z]; rotation is a unit quaternion [w, x, y, z]."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["position", "rotation"], errors);
  const position = parseVec3(value.position, `${path}.position`, errors, false);
  const rotation = parseQuat(value.rotation, `${path}.rotation`, errors);
  if (!position || !rotation) return undefined;
  return { position, rotation };
}

function parseRelative(
  value: unknown,
  path: string,
  suffixes: readonly string[],
  what: string,
  errors: WorldError[]
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(
      err(
        "schema",
        path,
        `${what} path is missing. Hint: use a path relative to the world file.`
      )
    );
    return undefined;
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("file://") ||
    value.startsWith("package://") ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
    errors.push(
      err(
        "schema",
        path,
        `${what} path "${value}" is absolute. Hint: use a path relative to the world file.`
      )
    );
    return undefined;
  }
  if (value.includes("\\") || value.split("/").includes("..")) {
    errors.push(
      err(
        "schema",
        path,
        `${what} path "${value}" is not a relative path inside the project. Hint: use forward slashes and do not use "..".`
      )
    );
    return undefined;
  }
  const lower = value.toLowerCase();
  if (!suffixes.some((suffix) => lower.endsWith(suffix))) {
    errors.push(
      err(
        "schema",
        path,
        `${what} path must end in ${suffixes.join(" or ")}. Hint: the path is relative to the world file.`
      )
    );
    return undefined;
  }
  return value;
}

function parseNonNegative(
  value: unknown,
  path: string,
  label: string,
  unit: string,
  errors: WorldError[]
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(
      err(
        "schema",
        path,
        `${label} must be a non-negative number of ${unit}. Hint: voltages are volts, current limit is amperes, rDroop is ohms.`
      )
    );
    return undefined;
  }
  return value;
}

function parseRobot(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldRobot | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A robot must be an object. Hint: give it an id, a urdf path, and a pose."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["id", "urdf", "pose"], errors);
  const id = parseId(value.id, `${path}.id`, errors);
  const urdf = parseRelative(
    value.urdf,
    `${path}.urdf`,
    [".urdf"],
    "URDF",
    errors
  );
  const pose = parsePose(value.pose, `${path}.pose`, errors);
  if (!id || !urdf || !pose) return undefined;
  return { id, urdf, pose };
}

function parseRobots(
  value: unknown,
  errors: WorldError[]
): WorldRobot[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      err(
        "schema",
        "robots",
        "robots must be an array. Hint: each entry has an id, a urdf path, and a pose."
      )
    );
    return undefined;
  }
  const robots: WorldRobot[] = [];
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    const robot = parseRobot(value[i], `robots[${i}]`, errors);
    if (robot) robots.push(robot);
    else ok = false;
  }
  return ok ? robots : undefined;
}

function parsePrimitive(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldPrimitive | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A primitive must be an object. Hint: shape is box, sphere, or cylinder, plus an id, a pose, and a size."
      )
    );
    return undefined;
  }
  const shape = value.shape;
  if (shape !== "box" && shape !== "sphere" && shape !== "cylinder") {
    errors.push(
      err(
        "schema",
        `${path}.shape`,
        "Primitive shape must be box, sphere, or cylinder. Hint: STEP props go in environment.stepProps, not here."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["id", "shape", "pose", "size"], errors);
  const id = parseId(value.id, `${path}.id`, errors);
  const pose = parsePose(value.pose, `${path}.pose`, errors);
  if (!id || !pose) return undefined;
  if (shape === "box") {
    const size = parseVec3(value.size, `${path}.size`, errors, true);
    if (!size) return undefined;
    return { id, shape, pose, size };
  }
  if (shape === "sphere") {
    if (
      typeof value.size !== "number" ||
      !Number.isFinite(value.size) ||
      value.size <= 0
    ) {
      errors.push(
        err(
          "schema",
          `${path}.size`,
          "Sphere size must be a radius in metres, greater than 0. Hint: size is a number, not [x, y, z]."
        )
      );
      return undefined;
    }
    return { id, shape, pose, size: value.size };
  }
  if (!isRecord(value.size)) {
    errors.push(
      err(
        "schema",
        `${path}.size`,
        "Cylinder size must be { radius, length } in metres. Hint: length is along the cylinder's local +Z."
      )
    );
    return undefined;
  }
  checkKeys(`${path}.size`, value.size, ["radius", "length"], errors);
  const { radius, length } = value.size;
  if (
    typeof radius !== "number" ||
    typeof length !== "number" ||
    !Number.isFinite(radius) ||
    !Number.isFinite(length) ||
    radius <= 0 ||
    length <= 0
  ) {
    errors.push(
      err(
        "schema",
        `${path}.size`,
        "Cylinder radius and length must be greater than 0. Hint: both are metres."
      )
    );
    return undefined;
  }
  return { id, shape, pose, size: { radius, length } };
}

function parseStepProp(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldStepProp | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A step prop must be an object. Hint: give it an id, a step path, and a pose. Milestone 1 does not load the file."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["id", "step", "pose"], errors);
  const id = parseId(value.id, `${path}.id`, errors);
  const step = parseRelative(
    value.step,
    `${path}.step`,
    [".step", ".stp"],
    "STEP",
    errors
  );
  const pose = parsePose(value.pose, `${path}.pose`, errors);
  if (!id || !step || !pose) return undefined;
  return { id, step, pose };
}

function parseEnvironment(
  value: unknown,
  errors: WorldError[]
): WorldEnvironment | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        "environment",
        "environment must be an object. Hint: set ground to { plane: true } or { plane: false }."
      )
    );
    return undefined;
  }
  checkKeys(
    "environment",
    value,
    ["ground", "primitives", "stepProps"],
    errors
  );
  if (!isRecord(value.ground)) {
    errors.push(
      err(
        "schema",
        "environment.ground",
        "ground must be { plane: true } or { plane: false }. Hint: this is the floor plane, not a wire's GND."
      )
    );
    return undefined;
  }
  checkKeys("environment.ground", value.ground, ["plane"], errors);
  if (typeof value.ground.plane !== "boolean") {
    errors.push(
      err(
        "schema",
        "environment.ground.plane",
        "ground.plane must be true or false. Hint: milestone 1 ground is a plane, on or off."
      )
    );
    return undefined;
  }
  let primitives: WorldPrimitive[] | undefined;
  if (value.primitives !== undefined) {
    if (!Array.isArray(value.primitives)) {
      errors.push(
        err(
          "schema",
          "environment.primitives",
          "primitives must be an array. Hint: each entry is a box, sphere, or cylinder."
        )
      );
      return undefined;
    }
    primitives = [];
    for (let i = 0; i < value.primitives.length; i++) {
      const primitive = parsePrimitive(
        value.primitives[i],
        `environment.primitives[${i}]`,
        errors
      );
      if (!primitive) return undefined;
      primitives.push(primitive);
    }
  }
  let stepProps: WorldStepProp[] | undefined;
  if (value.stepProps !== undefined) {
    if (!Array.isArray(value.stepProps)) {
      errors.push(
        err(
          "schema",
          "environment.stepProps",
          "stepProps must be an array. Hint: each entry is a typed placeholder and is not loaded in milestone 1."
        )
      );
      return undefined;
    }
    stepProps = [];
    for (let i = 0; i < value.stepProps.length; i++) {
      const prop = parseStepProp(
        value.stepProps[i],
        `environment.stepProps[${i}]`,
        errors
      );
      if (!prop) return undefined;
      stepProps.push(prop);
    }
  }
  return {
    ground: { plane: value.ground.plane },
    ...(primitives ? { primitives } : {}),
    ...(stepProps ? { stepProps } : {}),
  };
}

function parseBoard(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldDocument["boards"][number] | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A board must be an object. Hint: id, chip, board, firmware, pose, and size are required. source is optional."
      )
    );
    return undefined;
  }
  checkKeys(
    path,
    value,
    ["id", "chip", "board", "firmware", "source", "pose", "size"],
    errors
  );
  const id = parseId(value.id, `${path}.id`, errors);
  const chip = typeof value.chip === "string" ? value.chip : "";
  const board = typeof value.board === "string" ? value.board : "";
  if (!isChipId(chip)) {
    errors.push(
      err(
        "schema",
        `${path}.chip`,
        `Unknown chip "${String(value.chip)}". Hint: milestone 1 chip is "atmega328p".`
      )
    );
  }
  if (!isBoardId(board)) {
    errors.push(
      err(
        "schema",
        `${path}.board`,
        `Unknown board "${String(value.board)}". Hint: milestone 1 board is "uno".`
      )
    );
  }
  const model = isBoardId(board) ? boardModel(board) : undefined;
  if (model && isChipId(chip) && chip !== model.chip) {
    errors.push(
      err(
        "schema",
        `${path}.chip`,
        `Board "${board}" uses chip "${model.chip}", not "${chip}". Hint: set chip to "${model.chip}".`
      )
    );
  }
  const firmware = parseRelative(
    value.firmware,
    `${path}.firmware`,
    [".hex"],
    "Firmware",
    errors
  );
  let source: string | undefined;
  if (value.source !== undefined) {
    source = parseRelative(
      value.source,
      `${path}.source`,
      [".ino"],
      "Source",
      errors
    );
  }
  const pose = parsePose(value.pose, `${path}.pose`, errors);
  const size = parseVec3(value.size, `${path}.size`, errors, true);
  if (
    !id ||
    !isChipId(chip) ||
    !model ||
    !firmware ||
    (value.source !== undefined && !source) ||
    !pose ||
    !size
  ) {
    return undefined;
  }
  const parsed: WorldDocument["boards"][number] = {
    id,
    chip: chip as ChipId,
    board: board as BoardId,
    firmware,
    pose,
    size,
  };
  if (source) parsed.source = source;
  return parsed;
}

function parseBoards(
  value: unknown,
  errors: WorldError[]
): WorldDocument["boards"] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      err(
        "schema",
        "boards",
        "boards must be an array. Hint: each entry names a chip, a board type, and a firmware path."
      )
    );
    return undefined;
  }
  const boards: WorldDocument["boards"] = [];
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    const board = parseBoard(value[i], `boards[${i}]`, errors);
    if (board) boards.push(board);
    else ok = false;
  }
  return ok ? boards : undefined;
}

function parseSupply(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldSupply | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A supply must be an object. Hint: id, voltage (V), currentLimit (A), and rDroop (ohm)."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["id", "voltage", "currentLimit", "rDroop"], errors);
  const id = parseId(value.id, `${path}.id`, errors);
  const voltage = parseNonNegative(
    value.voltage,
    `${path}.voltage`,
    "voltage",
    "volts",
    errors
  );
  const currentLimit = parseNonNegative(
    value.currentLimit,
    `${path}.currentLimit`,
    "currentLimit",
    "amperes",
    errors
  );
  const rDroop = parseNonNegative(
    value.rDroop,
    `${path}.rDroop`,
    "rDroop",
    "ohms",
    errors
  );
  if (
    !id ||
    voltage === undefined ||
    currentLimit === undefined ||
    rDroop === undefined
  ) {
    return undefined;
  }
  return { id, voltage, currentLimit, rDroop };
}

function parseSupplies(
  value: unknown,
  errors: WorldError[]
): WorldSupply[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      err(
        "schema",
        "supplies",
        "supplies must be an array. Hint: each entry is a voltage, a current limit, and rDroop."
      )
    );
    return undefined;
  }
  const supplies: WorldSupply[] = [];
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    const supply = parseSupply(value[i], `supplies[${i}]`, errors);
    if (supply) supplies.push(supply);
    else ok = false;
  }
  return ok ? supplies : undefined;
}

function parseDrives(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldDrives | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "drives must be { robot, joint }. Hint: robot is a robot id and joint is a URDF joint name."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["robot", "joint"], errors);
  const robot = parseId(value.robot, `${path}.robot`, errors);
  const joint = parseId(value.joint, `${path}.joint`, errors);
  if (!robot || !joint) return undefined;
  return { robot, joint };
}

function parsePart(
  value: unknown,
  path: string,
  errors: WorldError[]
): WorldDocument["parts"][number] | undefined {
  if (!isRecord(value)) {
    errors.push(
      err(
        "schema",
        path,
        "A part must be an object. Hint: id and model are required. A servo also has drives."
      )
    );
    return undefined;
  }
  checkKeys(path, value, ["id", "model", "drives"], errors);
  const id = parseId(value.id, `${path}.id`, errors);
  const modelId = typeof value.model === "string" ? value.model : "";
  if (!isPartModelId(modelId)) {
    errors.push(
      err(
        "schema",
        `${path}.model`,
        `Unknown part model "${String(value.model)}". Hint: milestone 1 models are ${PART_MODEL_IDS.join(", ")}.`
      )
    );
    return undefined;
  }
  const model = partModel(modelId);
  if (!id || !model) return undefined;
  if (model.drive.kind === "servo") {
    if (value.drives === undefined) {
      errors.push(
        err(
          "schema",
          `${path}.drives`,
          `Part model "${modelId}" drives a joint. Hint: set drives to { robot, joint }.`
        )
      );
      return undefined;
    }
    const drives = parseDrives(value.drives, `${path}.drives`, errors);
    if (!drives) return undefined;
    return { id, model: modelId as PartModelId, drives };
  }
  if (value.drives !== undefined) {
    errors.push(
      err(
        "schema",
        `${path}.drives`,
        `Part model "${modelId}" does not drive a joint. Hint: an analogWrite part is only wired; remove drives.`
      )
    );
    return undefined;
  }
  return { id, model: modelId as PartModelId };
}

function parseParts(
  value: unknown,
  errors: WorldError[]
): WorldDocument["parts"] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      err(
        "schema",
        "parts",
        "parts must be an array. Hint: each entry names a part model and, for a servo, the joint it drives."
      )
    );
    return undefined;
  }
  const parts: WorldDocument["parts"] = [];
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    const part = parsePart(value[i], `parts[${i}]`, errors);
    if (part) parts.push(part);
    else ok = false;
  }
  return ok ? parts : undefined;
}

function parseWires(
  value: unknown,
  errors: WorldError[]
): WorldWire[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(
      err(
        "schema",
        "wires",
        'wires must be an array of pin-to-pin pairs. Hint: ["uno.D9", "servo.signal"].'
      )
    );
    return undefined;
  }
  const wires: WorldWire[] = [];
  let ok = true;
  for (let i = 0; i < value.length; i++) {
    const wire = value[i];
    const path = `wires[${i}]`;
    if (
      !Array.isArray(wire) ||
      wire.length !== 2 ||
      typeof wire[0] !== "string" ||
      typeof wire[1] !== "string"
    ) {
      errors.push(
        err(
          "schema",
          path,
          'A wire is two endpoint strings. Hint: ["uno.D9", "servo.signal"].'
        )
      );
      ok = false;
      continue;
    }
    if (!ENDPOINT.test(wire[0]) || !ENDPOINT.test(wire[1])) {
      errors.push(
        err(
          "schema",
          path,
          `Wire endpoints must be "<id>.<pin>", got "${wire[0]}" and "${wire[1]}". Hint: for example "uno.D9" or "usb.GND".`
        )
      );
      ok = false;
      continue;
    }
    if (wire[0] === wire[1]) {
      errors.push(
        err(
          "schema",
          path,
          "A wire must join two different pins. Hint: power and ground are separate wires."
        )
      );
      ok = false;
      continue;
    }
    wires.push([wire[0], wire[1]]);
  }
  return ok ? wires : undefined;
}

function checkDuplicateIds(doc: WorldDocument, errors: WorldError[]) {
  const seen = new Map<string, string>();
  const take = (id: string, path: string) => {
    const previous = seen.get(id);
    if (previous) {
      errors.push(
        err(
          "schema",
          path,
          `Duplicate id "${id}", also used at ${previous}. Hint: ids are unique across robots, boards, supplies, parts, primitives, and step props.`
        )
      );
      return;
    }
    seen.set(id, path);
  };
  for (let i = 0; i < doc.robots.length; i++) {
    const robot = doc.robots[i];
    if (robot) take(robot.id, `robots[${i}].id`);
  }
  const primitives = doc.environment.primitives ?? [];
  for (let i = 0; i < primitives.length; i++) {
    const primitive = primitives[i];
    if (primitive) take(primitive.id, `environment.primitives[${i}].id`);
  }
  const stepProps = doc.environment.stepProps ?? [];
  for (let i = 0; i < stepProps.length; i++) {
    const prop = stepProps[i];
    if (prop) take(prop.id, `environment.stepProps[${i}].id`);
  }
  for (let i = 0; i < doc.boards.length; i++) {
    const board = doc.boards[i];
    if (board) take(board.id, `boards[${i}].id`);
  }
  for (let i = 0; i < doc.supplies.length; i++) {
    const supply = doc.supplies[i];
    if (supply) take(supply.id, `supplies[${i}].id`);
  }
  for (let i = 0; i < doc.parts.length; i++) {
    const part = doc.parts[i];
    if (part) take(part.id, `parts[${i}].id`);
  }
}

function checkRobotRefs(doc: WorldDocument, errors: WorldError[]) {
  const robots = new Set(doc.robots.map((robot) => robot.id));
  doc.parts.forEach((part, i) => {
    if (!part.drives) return;
    if (robots.has(part.drives.robot)) return;
    errors.push(
      err(
        "schema",
        `parts[${i}].drives.robot`,
        `Unknown robot "${part.drives.robot}". Hint: drives.robot is a robot id from this world.`
      )
    );
  });
}

function parseWorld(
  input: unknown,
  errors: WorldError[]
): WorldDocument | undefined {
  if (!isRecord(input)) {
    errors.push(
      err(
        "schema",
        "",
        "World document must be a JSON object. Hint: start from version, robots, environment, boards, supplies, parts, and wires."
      )
    );
    return undefined;
  }
  checkKeys("", input, ROOT_KEYS, errors);
  if (input.version !== WORLD_VERSION) {
    errors.push(
      err(
        "schema",
        "version",
        `version must be ${WORLD_VERSION}. Hint: this validator reads world document version ${WORLD_VERSION}.`
      )
    );
  }
  const robots = parseRobots(input.robots, errors);
  const environment = parseEnvironment(input.environment, errors);
  const boards = parseBoards(input.boards, errors);
  const supplies = parseSupplies(input.supplies, errors);
  const parts = parseParts(input.parts, errors);
  const wires = parseWires(input.wires, errors);
  if (
    input.version !== WORLD_VERSION ||
    !robots ||
    !environment ||
    !boards ||
    !supplies ||
    !parts ||
    !wires ||
    errors.length > 0
  ) {
    return undefined;
  }
  const doc: WorldDocument = {
    version: WORLD_VERSION,
    robots,
    environment,
    boards,
    supplies,
    parts,
    wires,
  };
  checkDuplicateIds(doc, errors);
  checkRobotRefs(doc, errors);
  if (errors.length > 0) return undefined;
  return doc;
}

function checkFiles(
  doc: WorldDocument,
  ctx: WorldValidateCtx,
  errors: WorldError[]
) {
  doc.robots.forEach((robot, i) => {
    if (ctx.fileExists(robot.urdf)) return;
    errors.push(
      err(
        "missing-file",
        `robots[${i}].urdf`,
        `URDF "${robot.urdf}" does not exist. Hint: the path is relative to the world file.`
      )
    );
  });
  doc.boards.forEach((board, i) => {
    if (!ctx.fileExists(board.firmware)) {
      errors.push(
        err(
          "missing-file",
          `boards[${i}].firmware`,
          `Firmware "${board.firmware}" does not exist. Hint: the path is relative to the world file. Bench does not compile.`
        )
      );
    }
    if (board.source !== undefined && !ctx.fileExists(board.source)) {
      errors.push(
        err(
          "missing-file",
          `boards[${i}].source`,
          `Source "${board.source}" does not exist. Hint: the path is relative to the world file.`
        )
      );
    }
  });
}

function basename(filename: string): string {
  const parts = filename.split(/[\\/]/);
  return parts[parts.length - 1] ?? filename;
}

function isAbsoluteMesh(filename: string): boolean {
  return (
    filename.startsWith("/") ||
    filename.startsWith("\\") ||
    filename.startsWith("file://") ||
    /^[A-Za-z]:[\\/]/.test(filename)
  );
}

function meshMessage(filename: string): string | undefined {
  const trimmed = filename.trim();
  if (trimmed.toLowerCase().startsWith("package://")) {
    return `Mesh "${filename}" uses a package:// path. Hint: ${MESH_HINT}.`;
  }
  if (isAbsoluteMesh(trimmed)) {
    return `Mesh "${filename}" is an absolute path. Hint: ${MESH_HINT}.`;
  }
  if (trimmed.includes("\\") || trimmed.split("/").includes("..")) {
    return `Mesh "${filename}" leaves the URDF directory. Hint: ${MESH_HINT}.`;
  }
  const base = basename(trimmed).toLowerCase();
  if (base.endsWith(".stl") || base.endsWith(".obj")) return undefined;
  return `Mesh "${filename}" is not .stl or .obj. Hint: ${MESH_HINT}.`;
}

function checkRobots(
  doc: WorldDocument,
  ctx: WorldValidateCtx,
  errors: WorldError[],
  warnings: WorldWarning[]
) {
  const jointsByRobot = new Map<string, Set<string> | undefined>();
  doc.robots.forEach((robot, i) => {
    const path = `robots[${i}].urdf`;
    if (!ctx.fileExists(robot.urdf)) {
      jointsByRobot.set(robot.id, undefined);
      return;
    }
    const info = ctx.urdf(robot.urdf);
    if (!info) {
      errors.push(
        err(
          "schema",
          path,
          `No URDF info was supplied for "${robot.urdf}". Hint: pass joints and mesh filenames from extractUrdfJointsAndMeshes.`
        )
      );
      jointsByRobot.set(robot.id, undefined);
      return;
    }
    jointsByRobot.set(robot.id, new Set(info.joints));
    const counts = new Map<string, number>();
    for (const mesh of info.meshes) {
      const problem = meshMessage(mesh);
      if (problem) {
        errors.push(err("mesh-format", path, problem));
      } else {
        const resolved = resolveUrdfMesh(robot.urdf, mesh);
        if (!resolved || !ctx.fileExists(resolved)) {
          errors.push(
            err(
              "missing-file",
              path,
              `Mesh "${mesh}" does not exist. Hint: the path is relative to the URDF.`
            )
          );
        }
      }
      const base = basename(mesh).toLowerCase();
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    for (const [base, count] of counts) {
      if (count < 2) continue;
      warnings.push(
        warn(
          "duplicate-mesh-basename",
          path,
          `Robot "${robot.id}" uses mesh basename "${base}" ${count} times. Hint: MuJoCo keeps one mesh per basename; give each file a distinct name.`
        )
      );
    }
  });

  doc.parts.forEach((part, i) => {
    if (!part.drives) return;
    const known = jointsByRobot.get(part.drives.robot);
    if (!known) return;
    if (known.has(part.drives.joint)) return;
    errors.push(
      err(
        "unknown-joint",
        `parts[${i}].drives.joint`,
        `Robot "${part.drives.robot}" has no joint "${part.drives.joint}". Hint: drives.joint must be a joint name from that robot's URDF.`
      )
    );
  });
}

function pinList(pins: Record<string, WorldPin>): string {
  return Object.keys(pins).join(", ");
}

function resolveEndpoint(
  doc: WorldDocument,
  endpoint: string
): Resolved | ResolveFail {
  const dot = endpoint.indexOf(".");
  const id = endpoint.slice(0, dot);
  const pin = endpoint.slice(dot + 1);
  const board = doc.boards.find((item) => item.id === id);
  if (board) {
    const model = boardModel(board.board);
    const spec = model?.pins[pin];
    if (!model || !spec) {
      return {
        fail: "pin",
        id,
        pin,
        known: model ? pinList(model.pins) : "",
      };
    }
    return { endpoint, owner: "board", id, pin, spec, board: model };
  }
  const part = doc.parts.find((item) => item.id === id);
  if (part) {
    const model = partModel(part.model);
    const spec = model?.pins[pin];
    if (!model || !spec) {
      return {
        fail: "pin",
        id,
        pin,
        known: model ? pinList(model.pins) : "",
      };
    }
    return { endpoint, owner: "part", id, pin, spec };
  }
  const supply = doc.supplies.find((item) => item.id === id);
  if (supply) {
    const preset = supplyPresets[MILESTONE_SUPPLY_PRESET];
    const spec = preset.pins[pin];
    if (!spec) {
      return { fail: "pin", id, pin, known: pinList(preset.pins) };
    }
    return { endpoint, owner: "supply", id, pin, spec };
  }
  const named =
    doc.robots.some((item) => item.id === id) ||
    doc.environment.primitives?.some((item) => item.id === id) ||
    doc.environment.stepProps?.some((item) => item.id === id);
  if (named) return { fail: "no-pins", id };
  return { fail: "instance", id };
}

function unknownPin(
  fail: ResolveFail,
  path: string,
  endpoint: string
): WorldError {
  if (fail.fail === "instance") {
    return err(
      "unknown-pin",
      path,
      `"${fail.id}" in "${endpoint}" is not a board, part, or supply. Hint: wire endpoints name an id from this world, then a pin, as in "uno.D9".`
    );
  }
  if (fail.fail === "no-pins") {
    return err(
      "unknown-pin",
      path,
      `"${fail.id}" has no pins. Hint: wire a board, a part, or a supply.`
    );
  }
  return err(
    "unknown-pin",
    path,
    `"${fail.id}" has no pin "${fail.pin}". Hint: known pins are ${fail.known}.`
  );
}

function checkWires(doc: WorldDocument, errors: WorldError[]) {
  doc.wires.forEach((wire, i) => {
    const path = `wires[${i}]`;
    const left = resolveEndpoint(doc, wire[0]);
    const right = resolveEndpoint(doc, wire[1]);
    if ("fail" in left) errors.push(unknownPin(left, path, wire[0]));
    if ("fail" in right) errors.push(unknownPin(right, path, wire[1]));
  });
}

function linkEnds(map: Map<string, string[]>, from: string, to: string) {
  const list = map.get(from);
  if (list) list.push(to);
  else map.set(from, [to]);
}

/** One connected component per set of endpoints joined by any wire. */
function wireNets(doc: WorldDocument): Resolved[][] {
  const nodes = new Map<string, Resolved>();
  const adjacent = new Map<string, string[]>();
  for (const wire of doc.wires) {
    const left = resolveEndpoint(doc, wire[0]);
    const right = resolveEndpoint(doc, wire[1]);
    if ("fail" in left || "fail" in right) continue;
    nodes.set(left.endpoint, left);
    nodes.set(right.endpoint, right);
    linkEnds(adjacent, left.endpoint, right.endpoint);
    linkEnds(adjacent, right.endpoint, left.endpoint);
  }
  const seen = new Set<string>();
  const nets: Resolved[][] = [];
  for (const start of nodes.keys()) {
    if (seen.has(start)) continue;
    const members: Resolved[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      const node = nodes.get(current);
      if (node) members.push(node);
      for (const next of adjacent.get(current) ?? []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    nets.push(members);
  }
  return nets;
}

function pinKindMessage(net: Resolved[]): string | undefined {
  const power = net.find((node) => node.spec.kind === "power");
  const ground = net.find((node) => node.spec.kind === "ground");
  const other = net.find(
    (node) => node.spec.kind !== "power" && node.spec.kind !== "ground"
  );
  if (power && (ground || other)) {
    const mate = ground ?? other;
    return `Power pin "${power.endpoint}" shares a net with "${mate?.endpoint}". Hint: tie power only to power. A power-to-ground wire is a short.`;
  }
  if (ground && other) {
    return `Ground pin "${ground.endpoint}" shares a net with "${other.endpoint}". Hint: tie ground only to ground.`;
  }
  return undefined;
}

function checkNets(doc: WorldDocument, errors: WorldError[]) {
  const nets = wireNets(doc);
  for (const net of nets) {
    const outputs = net.filter((node) => node.spec.output);
    if (outputs.length >= 2) {
      const names = outputs.map((node) => node.endpoint).join(", ");
      errors.push(
        err(
          "two-outputs",
          "wires",
          `Wire net has outputs ${names}. Hint: one net can have one driving pin.`
        )
      );
    }
    const clash = pinKindMessage(net);
    if (clash) errors.push(err("pin-kind", "wires", clash));
    const positives = net.filter(
      (node) => node.owner === "supply" && node.spec.output
    );
    for (const node of net) {
      if (node.owner !== "board" || !node.board) continue;
      if (node.spec.kind !== "power" || node.spec.output) continue;
      if (node.board.powerInputs.includes(node.pin)) continue;
      if (positives.length === 0) continue;
      const from = positives.map((pin) => pin.endpoint).join(", ");
      errors.push(
        err(
          "power-input",
          "wires",
          `Supply ${from} reaches "${node.endpoint}", which does not power the board. Hint: milestone 1 has no regulator model. Power the board through its 5V pin, not ${node.pin}.`
        )
      );
    }
  }

  for (let i = 0; i < doc.parts.length; i++) {
    const part = doc.parts[i];
    if (!part) continue;
    const model = partModel(part.model);
    if (model?.drive.kind !== "servo") continue;
    const endpoint = `${part.id}.${model.drive.pin}`;
    const net = nets.find((members) =>
      members.some((node) => node.endpoint === endpoint)
    );
    if (!net) continue;
    const digital = net.some(
      (node) => node.owner === "board" && node.spec.digital
    );
    if (digital) continue;
    errors.push(
      err(
        "signal-pin",
        `parts[${i}]`,
        `Servo "${part.id}" signal does not reach a digital board pin. Hint: Servo.h may use any digital pin, including A0–A5. 5V, 3V3, VIN, and GND are not digital pins.`
      )
    );
  }
}

function servoSignalWired(doc: WorldDocument): boolean {
  return doc.parts.some((part) => {
    const model = partModel(part.model);
    if (model?.drive.kind !== "servo") return false;
    const endpoint = `${part.id}.${model.drive.pin}`;
    return doc.wires.some(
      (wire) => wire[0] === endpoint || wire[1] === endpoint
    );
  });
}

function checkDrivePins(
  doc: WorldDocument,
  errors: WorldError[],
  warnings: WorldWarning[]
) {
  const servoWired = servoSignalWired(doc);
  doc.parts.forEach((part) => {
    const model = partModel(part.model);
    if (model?.drive.kind !== "analogWrite") return;
    const endpoint = `${part.id}.${model.drive.pin}`;
    doc.wires.forEach((wire, wi) => {
      if (wire[0] !== endpoint && wire[1] !== endpoint) return;
      const other = wire[0] === endpoint ? wire[1] : wire[0];
      const resolved = resolveEndpoint(doc, other);
      if ("fail" in resolved) return;
      const pwmOk =
        resolved.owner === "board" &&
        resolved.spec.kind === "gpio" &&
        resolved.spec.pwm;
      if (!pwmOk) {
        const pins =
          resolved.board?.pwmPins.join(", ") ?? "a PWM-capable board pin";
        errors.push(
          err(
            "pwm-pin",
            `wires[${wi}]`,
            `Part "${part.id}" is driven by analogWrite on ${other}, which is not a PWM pin. Hint: use one of ${pins}. A servo may use any digital pin.`
          )
        );
        return;
      }
      const conflict = resolved.board?.servoConflictPins ?? [];
      if (servoWired && conflict.includes(resolved.pin)) {
        warnings.push(
          warn(
            "servo-pwm-conflict",
            `wires[${wi}]`,
            `Part "${part.id}" is driven by analogWrite on ${other} while a servo signal is wired. Hint: Servo.h uses Timer1, which disables PWM on ${conflict.join(" and ")}.`
          )
        );
      }
    });
  });
}

function supplyNodes(doc: WorldDocument): SupplyNode[] {
  const preset = supplyPresets[MILESTONE_SUPPLY_PRESET];
  return doc.supplies.map((supply) => ({
    id: supply.id,
    voltage: supply.voltage,
    positive: `${supply.id}.${preset.positivePin}`,
    ground: `${supply.id}.${preset.groundPin}`,
  }));
}

function adjacency(
  doc: WorldDocument,
  kind: "power" | "ground"
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const wire of doc.wires) {
    const left = resolveEndpoint(doc, wire[0]);
    const right = resolveEndpoint(doc, wire[1]);
    if ("fail" in left || "fail" in right) continue;
    if (left.spec.kind !== kind || right.spec.kind !== kind) continue;
    link(wire[0], wire[1]);
    link(wire[1], wire[0]);
  }
  return map;
}

function reachable(
  start: string,
  adjacent: Map<string, string[]>
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacent.get(current) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function outOfRange(
  voltage: number,
  range: { min: number; max: number }
): boolean {
  return voltage < range.min - 1e-9 || voltage > range.max + 1e-9;
}

function rangeText(range: { min: number; max: number }): string {
  if (range.min === range.max) return `${range.min} V`;
  return `${range.min}-${range.max} V`;
}

function suppliesOn(nodes: SupplyNode[], reached: Set<string>): SupplyNode[] {
  const found: SupplyNode[] = [];
  for (const node of nodes) {
    if (reached.has(node.positive) && !found.includes(node)) found.push(node);
  }
  return found;
}

type FedDevice = {
  path: string;
  name: string;
  /** "Board" or "Part", used in messages. */
  noun: "Board" | "Part";
  /** Endpoints a supply may power this device through. */
  powerEndpoints: string[];
  voltageChecks: {
    endpoint: string;
    pin: string;
    range: { min: number; max: number };
  }[];
  groundEndpoints: string[];
};

function fedDevices(doc: WorldDocument): FedDevice[] {
  const devices: FedDevice[] = [];
  for (let i = 0; i < doc.boards.length; i++) {
    const board = doc.boards[i];
    if (!board) continue;
    const model = boardModel(board.board);
    if (!model) continue;
    devices.push({
      path: `boards[${i}]`,
      name: board.id,
      noun: "Board",
      powerEndpoints: model.powerInputs.map((pin) => `${board.id}.${pin}`),
      voltageChecks: [
        {
          endpoint: `${board.id}.${model.voltagePin}`,
          pin: model.voltagePin,
          range: model.supply,
        },
      ],
      groundEndpoints: [`${board.id}.${model.groundPin}`],
    });
  }
  for (let i = 0; i < doc.parts.length; i++) {
    const part = doc.parts[i];
    if (!part) continue;
    const model = partModel(part.model);
    if (!model) continue;
    const powerPins = Object.entries(model.pins).filter(
      ([, pin]) => pin.kind === "power"
    );
    if (powerPins.length === 0) continue;
    const range = model.supply;
    devices.push({
      path: `parts[${i}]`,
      name: part.id,
      noun: "Part",
      powerEndpoints: powerPins.map(([pin]) => `${part.id}.${pin}`),
      voltageChecks: range
        ? powerPins.map(([pin]) => ({
            endpoint: `${part.id}.${pin}`,
            pin,
            range,
          }))
        : [],
      groundEndpoints: Object.entries(model.pins)
        .filter(([, pin]) => pin.kind === "ground")
        .map(([pin]) => `${part.id}.${pin}`),
    });
  }
  return devices;
}

function suppliesReached(
  endpoints: string[],
  nodes: SupplyNode[],
  adjacent: Map<string, string[]>
): SupplyNode[] {
  const found: SupplyNode[] = [];
  for (const endpoint of endpoints) {
    for (const node of suppliesOn(nodes, reachable(endpoint, adjacent))) {
      if (!found.includes(node)) found.push(node);
    }
  }
  return found;
}

function checkPower(doc: WorldDocument, errors: WorldError[]) {
  const nodes = supplyNodes(doc);
  const power = adjacency(doc, "power");
  const ground = adjacency(doc, "ground");
  for (const device of fedDevices(doc)) {
    const powering = suppliesReached(device.powerEndpoints, nodes, power);
    for (const check of device.voltageChecks) {
      for (const node of suppliesOn(nodes, reachable(check.endpoint, power))) {
        if (!outOfRange(node.voltage, check.range)) continue;
        const whose = device.noun === "Board" ? "board" : "part";
        errors.push(
          err(
            "voltage-mismatch",
            device.path,
            `${device.noun} "${device.name}" ${check.pin} is wired to supply "${node.id}" at ${node.voltage} V, outside ${rangeText(check.range)}. Hint: use a supply inside the ${whose}'s range.`
          )
        );
      }
    }
    for (const node of powering) {
      const grounded = device.groundEndpoints.some((pin) =>
        reachable(pin, ground).has(node.ground)
      );
      if (grounded) continue;
      errors.push(
        err(
          "missing-ground",
          device.path,
          `${device.noun} "${device.name}" is powered by "${node.id}" but its GND does not reach that supply's GND. Hint: wire the grounds together. Power and ground are both explicit.`
        )
      );
    }
  }
}

export function validateWorld(
  doc: unknown,
  ctx: WorldValidateCtx
): WorldValidation {
  const errors: WorldError[] = [];
  const warnings: WorldWarning[] = [];
  const parsed = parseWorld(doc, errors);
  if (!parsed) return { ok: false, errors, warnings };
  checkFiles(parsed, ctx, errors);
  checkRobots(parsed, ctx, errors, warnings);
  checkWires(parsed, errors);
  checkNets(parsed, errors);
  checkDrivePins(parsed, errors, warnings);
  checkPower(parsed, errors);
  return { ok: errors.length === 0, errors, warnings };
}
