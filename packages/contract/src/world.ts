/**
 * The `.world.json` document (ADR 0009). Declarative data only: a robot
 * URDF, an environment, boards, supplies, part-model instances, and
 * pin-to-pin wires. The server builds a run from this later. This module
 * does not read files and does not step physics.
 *
 * Frame: metres, right-handed, Z-up, matching the URDF (REP-103) and
 * MuJoCo. Rotation is one convention: a unit quaternion, scalar first
 * `[w, x, y, z]`. Identity is `[1, 0, 0, 0]`.
 *
 * Paths in the document are relative to the world file. Part behaviour
 * numbers (currents, voltage range, stall rule, brownout, speed, torque)
 * live in the catalog below, not as constants in the validator.
 */

export const WORLD_VERSION = 1;

/** Metres, [x, y, z]. */
export type WorldVec3 = [number, number, number];

/** Unit quaternion, scalar first: [w, x, y, z]. */
export type WorldQuat = [number, number, number, number];

/**
 * Body frame. `position` is the origin in metres. `rotation` takes that
 * frame onto the world. Boxes (boards and box primitives) are centered
 * on this origin: rest one on the ground by setting z to half its height.
 */
export type WorldPose = {
  position: WorldVec3;
  rotation: WorldQuat;
};

export type WorldRobot = {
  id: string;
  /** `.urdf` path relative to the world file. */
  urdf: string;
  pose: WorldPose;
};

/** A ground plane, on or off. Not the electrical ground of a wire. */
export type WorldGround = {
  plane: boolean;
};

/**
 * Full edge lengths in metres. The box is centered on `pose`.
 */
export type WorldBox = {
  id: string;
  shape: "box";
  pose: WorldPose;
  size: WorldVec3;
};

export type WorldSphere = {
  id: string;
  shape: "sphere";
  pose: WorldPose;
  /** Radius in metres. */
  size: number;
};

export type WorldCylinder = {
  id: string;
  shape: "cylinder";
  pose: WorldPose;
  /** Radius and length in metres. Length is along the cylinder's local +Z. */
  size: { radius: number; length: number };
};

export type WorldPrimitive = WorldBox | WorldSphere | WorldCylinder;

/**
 * Typed placeholder for a STEP prop. Milestone 1 does not load it: the
 * validator checks the shape and does not ask whether the file exists.
 */
export type WorldStepProp = {
  id: string;
  /** Relative path to a `.step` or `.stp` file. */
  step: string;
  pose: WorldPose;
};

export type WorldEnvironment = {
  ground: WorldGround;
  primitives?: WorldPrimitive[];
  stepProps?: WorldStepProp[];
};

export type WorldBoard = {
  id: string;
  chip: ChipId;
  board: BoardId;
  /** Relative path to a `.hex` firmware image. */
  firmware: string;
  /** Optional read-only sketch, relative path to a `.ino`. */
  source?: string;
  pose: WorldPose;
  /**
   * Full extents, in metres, of a box centered on `pose`. Milestone 1
   * geometry is this box and nothing else.
   */
  size: WorldVec3;
};

export type WorldSupply = {
  id: string;
  /** Volts. Nominal voltage, before droop. */
  voltage: number;
  /** Amperes. Voltage stays nominal up to this draw. */
  currentLimit: number;
  /**
   * Ohms. Above the current limit,
   * `V = voltage − rDroop · (I − currentLimit)`, clamped at 0.
   */
  rDroop: number;
};

/** A servo's target in the robot. `joint` is a URDF joint name. */
export type WorldDrives = {
  robot: string;
  joint: string;
};

export type WorldPart = {
  id: string;
  model: PartModelId;
  /**
   * Present when the part model's drive kind is `servo`. Absent for an
   * `analogWrite` part, which only connects to a pin.
   */
  drives?: WorldDrives;
};

/** Pin-to-pin. Each end is `"<id>.<pin>"`, for example `"uno.D9"`. */
export type WorldWire = [string, string];

export type WorldDocument = {
  version: typeof WORLD_VERSION;
  robots: WorldRobot[];
  environment: WorldEnvironment;
  boards: WorldBoard[];
  supplies: WorldSupply[];
  parts: WorldPart[];
  wires: WorldWire[];
};

export type WorldPinKind = "gpio" | "power" | "ground" | "signal";

export type WorldPin = {
  kind: WorldPinKind;
  /** Drives a net. Two or more on one connected wire net is `two-outputs`. */
  output: boolean;
  /** A servo may attach here. Digital GPIO, including A0–A5. */
  digital: boolean;
  /** `analogWrite` is legal here. */
  pwm: boolean;
};

export type ChipModel = {
  /** Volts. The board resets below this. */
  brownoutVoltage: number;
  /** AVR extended fuse that selects `brownoutVoltage`. */
  extendedFuse: string;
};

export type BoardModel = {
  chip: ChipId;
  /** Volts. Nominal rail voltage. */
  operatingVoltage: number;
  /** Inclusive range accepted on `voltagePin`. */
  supply: { min: number; max: number };
  /** Amperes drawn by the board, independent of voltage. */
  current: number;
  pins: Record<string, WorldPin>;
  pwmPins: readonly string[];
  /**
   * `analogWrite` on one of these warns when any servo signal is wired.
   * On the Uno they are the Timer1 PWM pins Servo.h takes over.
   */
  servoConflictPins: readonly string[];
  /**
   * Pins through which a supply powers the board. Milestone 1 is `5V`.
   * `VIN` stays a named pin and is not an input: there is no regulator.
   */
  powerInputs: readonly string[];
  /** The pin whose connected supply is checked against `supply`. */
  voltagePin: string;
  groundPin: string;
};

export type PartDriveKind = "servo" | "analogWrite";

export type PartModel = {
  pins: Record<string, WorldPin>;
  drive: { kind: PartDriveKind; pin: string };
  /** Volts. Absent when the part has no supply pin. */
  supply?: { nominal: number; min: number; max: number };
  /** Amperes by motion state, independent of voltage. */
  current?: { idle: number; moving: number; stall: number };
  stall?: {
    /** Degrees. `|commanded − measured|` must exceed this. */
    minAngleErrorDeg: number;
    /** Degrees per second. `|joint velocity|` must be below this. */
    maxVelocityDegPerSec: number;
    /** Milliseconds of sim time both conditions must hold. */
    holdMs: number;
  };
  /**
   * Degrees per second at `supply.nominal`. The joint setpoint slews
   * toward the command at this rate. W4 uses V = V_nom.
   */
  speedDegPerSec?: number;
  /**
   * Newton-metres at `supply.nominal`. Actuator torque is clamped to
   * ±this. W4 uses V = V_nom. `voltageScale` is how W4b drops both.
   */
  torqueNm?: number;
  /**
   * When set, speed and torque scale by `V / V_nom`.
   * `V_nom` is `supply.nominal`.
   */
  voltageScale?: "V/V_nom";
};

export type SupplyPreset = {
  /** Volts. */
  voltage: number;
  /** Amperes. */
  currentLimit: number;
  /** Ohms. */
  rDroop: number;
  positivePin: string;
  groundPin: string;
  pins: Record<string, WorldPin>;
};

const GPIO = (pwm: boolean): WorldPin => ({
  kind: "gpio",
  output: true,
  digital: true,
  pwm,
});

const POWER = (output: boolean): WorldPin => ({
  kind: "power",
  output,
  digital: false,
  pwm: false,
});

const GROUND: WorldPin = {
  kind: "ground",
  output: false,
  digital: false,
  pwm: false,
};

const SIGNAL: WorldPin = {
  kind: "signal",
  output: false,
  digital: false,
  pwm: false,
};

export const CHIP_IDS = ["atmega328p"] as const;
export type ChipId = (typeof CHIP_IDS)[number];

export const BOARD_IDS = ["uno"] as const;
export type BoardId = (typeof BOARD_IDS)[number];

export const PART_MODEL_IDS = ["sg90", "led-pwm"] as const;
export type PartModelId = (typeof PART_MODEL_IDS)[number];

export const SUPPLY_PRESET_IDS = ["usb"] as const;
export type SupplyPresetId = (typeof SUPPLY_PRESET_IDS)[number];

/**
 * Terminal names every milestone-1 supply instance exposes. The instance
 * still carries its own voltage, current limit, and droop; this preset
 * is the canonical USB supply those numbers are copied from, and the
 * only pin layout. A later preset can add a field without renaming these.
 */
export const MILESTONE_SUPPLY_PRESET: SupplyPresetId = "usb";

export const chipModels: Record<ChipId, ChipModel> = {
  atmega328p: {
    brownoutVoltage: 2.7,
    extendedFuse: "0xFD",
  },
};

const UNO_PWM_PINS = ["D3", "D5", "D6", "D9", "D10", "D11"] as const;
const UNO_SERVO_CONFLICT_PINS = ["D9", "D10"] as const;

function unoPins(): Record<string, WorldPin> {
  const pwm = new Set<string>(UNO_PWM_PINS);
  const pins: Record<string, WorldPin> = {};
  for (let i = 0; i <= 13; i++) pins[`D${i}`] = GPIO(pwm.has(`D${i}`));
  for (let i = 0; i <= 5; i++) pins[`A${i}`] = GPIO(false);
  pins["5V"] = POWER(false);
  // Regulator output. A supply positive tied here is two outputs.
  pins["3V3"] = POWER(true);
  // Named so a wire to it resolves. Not a power input in milestone 1.
  pins.VIN = POWER(false);
  pins.GND = GROUND;
  return pins;
}

export const boardModels: Record<BoardId, BoardModel> = {
  uno: {
    chip: "atmega328p",
    operatingVoltage: 5,
    supply: { min: 5, max: 5 },
    current: 0.05,
    pins: unoPins(),
    pwmPins: UNO_PWM_PINS,
    servoConflictPins: UNO_SERVO_CONFLICT_PINS,
    powerInputs: ["5V"],
    voltagePin: "5V",
    groundPin: "GND",
  },
};

export const partModels: Record<PartModelId, PartModel> = {
  sg90: {
    pins: {
      signal: SIGNAL,
      "V+": POWER(false),
      GND: GROUND,
    },
    drive: { kind: "servo", pin: "signal" },
    supply: { nominal: 5, min: 4.8, max: 6 },
    current: { idle: 0.01, moving: 0.25, stall: 0.7 },
    stall: {
      minAngleErrorDeg: 5,
      maxVelocityDegPerSec: 5,
      holdMs: 50,
    },
    // 0.1 s per 60° at 5 V. 1.8 kgf·cm is 0.176 N·m.
    speedDegPerSec: 600,
    torqueNm: 0.176,
    voltageScale: "V/V_nom",
  },
  /**
   * Not a milestone-1 actuator. Nothing else is driven by `analogWrite`
   * (the SG90 is `servo`, pulse width, Servo.h). This entry exists so
   * the PWM-pin rule can reject a non-PWM pin and warn on D9/D10.
   * Signal and ground only: it draws no supply current.
   */
  "led-pwm": {
    pins: {
      signal: SIGNAL,
      GND: GROUND,
    },
    drive: { kind: "analogWrite", pin: "signal" },
  },
};

export const supplyPresets: Record<SupplyPresetId, SupplyPreset> = {
  usb: {
    voltage: 5,
    currentLimit: 0.5,
    rDroop: 10,
    positivePin: "5V",
    groundPin: "GND",
    pins: {
      "5V": POWER(true),
      GND: GROUND,
    },
  },
};

export const worldCatalog = {
  version: WORLD_VERSION,
  chips: chipModels,
  boards: boardModels,
  parts: partModels,
  supplies: supplyPresets,
};

export function chipModel(id: string): ChipModel | undefined {
  if (!isChipId(id)) return undefined;
  return chipModels[id];
}

export function boardModel(id: string): BoardModel | undefined {
  if (!isBoardId(id)) return undefined;
  return boardModels[id];
}

export function partModel(id: string): PartModel | undefined {
  if (!isPartModelId(id)) return undefined;
  return partModels[id];
}

export function isChipId(id: string): id is ChipId {
  return (CHIP_IDS as readonly string[]).includes(id);
}

export function isBoardId(id: string): id is BoardId {
  return (BOARD_IDS as readonly string[]).includes(id);
}

export function isPartModelId(id: string): id is PartModelId {
  return (PART_MODEL_IDS as readonly string[]).includes(id);
}
