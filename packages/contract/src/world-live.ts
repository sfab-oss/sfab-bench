/**
 * The shared world run (ADR 0009, D-015). One document, one sim.
 * Camera and scrub stay on the client. `timeline` and `seek` are answered
 * to the sender only and do not change the run.
 *
 * Poses are the body frame in the world: metres, Z-up, quaternion scalar
 * first `[w, x, y, z]`. Joint values are radians.
 */

import type { WorldError } from "./validate-world";
import type { WorldQuat, WorldVec3 } from "./world";

export type WorldLinkPose = {
  /** Position in metres. */
  p: WorldVec3;
  /** Unit quaternion, scalar first. */
  q: WorldQuat;
};

/**
 * Arduino pins in one number. Bit 0 is D0 … bit 13 is D13, bit 14 is A0 …
 * bit 19 is A5. PORTB6–7 and PORTC6–7 are not part of the mask.
 *
 * Collected at the state tick: port listeners OR the bits that changed,
 * and the tick reads DDR, PORT, and PIN. Nothing walks instructions.
 */
export type WorldPinState = {
  /** 1 = output (DDR). */
  ddr: number;
  /** PORT when the pin is an output, PIN when it is an input. */
  level: number;
  /** 1 if that pin changed since the previous state tick. */
  toggled: number;
};

/** D0–D13, then A0–A5. The pin table and the mask use this order. */
export const ARDUINO_PINS: readonly string[] = [
  "D0",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
];

/** Bit index in `WorldPinState`, or undefined when `pin` is not D0–D13 or A0–A5. */
export function arduinoPinBit(pin: string): number | undefined {
  const digital = /^D(\d+)$/.exec(pin);
  if (digital) {
    const n = Number(digital[1]);
    if (n >= 0 && n <= 13) return n;
    return undefined;
  }
  const analog = /^A(\d+)$/.exec(pin);
  if (analog) {
    const n = Number(analog[1]);
    if (n >= 0 && n <= 5) return 14 + n;
    return undefined;
  }
  return undefined;
}

export function maskHasPin(mask: number, pin: string): boolean {
  const bit = arduinoPinBit(pin);
  if (bit === undefined) return false;
  return (mask & (1 << bit)) !== 0;
}

/**
 * Pack PORTD, PORTB, and PORTC into the 20-bit Arduino mask.
 * D0–D7 = PORTD0–7, D8–D13 = PORTB0–5, A0–A5 = PORTC0–5.
 */
export function arduinoPinMask(
  portD: number,
  portB: number,
  portC: number
): number {
  return (portD & 0xff) | ((portB & 0x3f) << 8) | ((portC & 0x3f) << 14);
}

/** Servo electrical state. Current follows this, not the supply voltage. */
export type WorldPartMotion = "idle" | "moving" | "stall";

/**
 * One part in the shared run, at the state rate. `null` is no signal:
 * the pulse was missing, out of range, or older than the gap.
 * `state` and `current` are optional so a client from before the power
 * budget still reads the pulse.
 */
export type WorldPartState = {
  /** Last complete pulse width, in microseconds. */
  pulseUs: number | null;
  /** Command angle in degrees, from the servo map. */
  commandDeg: number | null;
  /** Idle, moving, or stall. Absent on an older client. */
  state?: WorldPartMotion;
  /** Amperes. Follows `state`. An unwired supply pin is 0. */
  current?: number;
};

/** One supply in the shared run. Optional on `WorldState` for older clients. */
export type WorldSupplyState = {
  /** Volts after droop, never negative. */
  voltage: number;
  /** Amperes drawn from this supply, from the previous step's part states. */
  current: number;
};

/** One board in the shared run. `pins` is the 20-bit snapshot for this tick. */
export type WorldBoardState = {
  /**
   * The firmware image is loaded. While the run is paused the CPU does
   * not advance, and `running` stays true. A fault clears it.
   */
  running: boolean;
  /** Why this board is stopped. The rest of the run keeps going. */
  fault?: string;
  /** Absent only on a client that has not seen a state tick yet. */
  pins?: WorldPinState;
  /** Brownout reboots since this world was loaded. Absent on older clients. */
  resets?: number;
  /** True while the supply is under the chip's brownout voltage. */
  brownout?: boolean;
};

export type WorldState = {
  /** Seconds of simulation since the run was loaded or reloaded. */
  simTime: number;
  playing: boolean;
  /** robot id → link name → world pose of that body. */
  poses: Record<string, Record<string, WorldLinkPose>>;
  /** robot id → joint name → joint position in radians. */
  joints: Record<string, Record<string, number>>;
  /** board id → whether that CPU is loaded. */
  boards: Record<string, WorldBoardState>;
  /**
   * part id → pulse and command. Optional so a client from before this
   * field still reads the rest of the state.
   */
  parts?: Record<string, WorldPartState>;
  /**
   * supply id → voltage and current. Optional so an older client ignores
   * the power budget. Voltage is from the previous step's currents.
   */
  supplies?: Record<string, WorldSupplyState>;
  /**
   * The recording this run is writing. Absent on a client from before
   * timelines. `from` > 0 means the front of the recording was dropped.
   */
  recording?: RecordingSummary;
};

/**
 * Who sent play or pause. A principal is its kind plus the device label
 * the session already shows. The agent has no device.
 */
export type WorldSender =
  | { kind: "loopback"; label: string }
  | { kind: "paired"; label: string }
  | { kind: "agent" };

/** Play/pause nonce. Optional, and absent on agent commands. */
export const WORLD_NONCE_MAX = 64;

/** One serial-send or send_serial payload, in characters. */
export const SERIAL_TEXT_MAX = 8_000;

/** What a client may send on the world socket. `step` is loopback only. */
export type WorldClientMessage =
  | { type: "play"; nonce?: string }
  | { type: "pause"; nonce?: string }
  | { type: "step"; n: number }
  | { type: "serial-send"; board: string; text: string; nonce?: string }
  /** Overview series for this client's strip. Does not move the run. */
  | { type: "timeline"; from: number; to: number; maxPoints: number }
  /** This client wants the recorded frame at `t`. Does not move the run. */
  | { type: "seek"; t: number; nonce: string };

export type WorldServerMessage =
  | { type: "state"; state: WorldState }
  | {
      type: "command";
      command: "play" | "pause";
      by: WorldSender;
      /** Echo of the client nonce. Absent when the sender did not pass one. */
      nonce?: string;
    }
  | { type: "reloaded" }
  /** The document cannot run. A board fault is `board-error`, not this. */
  | { type: "error"; errors: WorldError[]; message?: string }
  /**
   * One board failed, or this client's serial write was rejected.
   * The run keeps its play state. `nonce` is set on a rejected send so
   * only that sender shows the line.
   */
  | { type: "board-error"; board: string; message: string; nonce?: string }
  /** USART0 TX since the previous event. `next` is the ring offset after `text`. */
  | { type: "serial"; board: string; text: string; next: number }
  | {
      type: "serial-sent";
      board: string;
      text: string;
      by: WorldSender;
      nonce?: string;
    }
  /**
   * Overview for the client that asked. Pin masks are never interpolated:
   * a point is a real frame, and its extremes cover the frames it stands in for.
   */
  | {
      type: "timeline-data";
      recording: string;
      from: number;
      to: number;
      tracks: TimelineTrack[];
      markers: TimelineMarker[];
    }
  /** The recorded frame for the client that sought. `frame` is null when `t` is gone. */
  | {
      type: "frame";
      recording: string;
      t: number;
      frame: RecordedFrame | null;
      nonce: string;
    }
  /**
   * The seek or timeline read failed. The shared run is unchanged.
   * `nonce` is set for a failed seek so that client can retire it.
   */
  | { type: "timeline-error"; message: string; nonce?: string };

/** One frame every 10 ms of sim time. The name is the unit. */
export const RECORD_FRAME_MS = 10;

/** How much sim time a recording keeps. Older frames and events drop. */
export const RECORD_BOUND_MS = 10 * 60 * 1000;

/** Live extent of the recording, riding on `state`. Times are seconds. */
export type RecordingSummary = {
  id: string;
  /** Seconds. Greater than 0 after the front has been dropped. */
  from: number;
  /** Seconds. The live edge, which may sit between frames. */
  to: number;
};

/** Track ids the host reports. Prefixed so one list can name every channel. */
export type RecordingTracks = {
  joints: string[];
  bodies: string[];
  parts: string[];
  supplies: string[];
  boards: string[];
};

export type RecordingInfo = RecordingSummary & {
  frameMs: number;
  tracks: RecordingTracks;
};

export function jointTrackId(robot: string, joint: string): string {
  return `joint:${robot}/${joint}`;
}

export function bodyTrackId(robot: string, link: string): string {
  return `body:${robot}/${link}`;
}

export function partTrackId(id: string): string {
  return `part:${id}`;
}

export function supplyTrackId(id: string): string {
  return `supply:${id}`;
}

export function boardTrackId(id: string): string {
  return `board:${id}`;
}

/**
 * One recorded instant. Joints are radians, like `WorldState`.
 * `minVoltage`, `maxCurrent`, `worst`, and `brownoutAny` cover the
 * window (t − frame, t], so a 1 ms dip is not lost between frames.
 */
export type RecordedFrame = {
  /** Seconds of sim time. */
  t: number;
  joints: Record<string, Record<string, number>>;
  poses: Record<string, Record<string, WorldLinkPose>>;
  parts: Record<
    string,
    {
      pulseUs: number | null;
      commandDeg: number | null;
      /** Value at t. */
      state: WorldPartMotion;
      /** Worst in the window. Stall outranks moving, which outranks idle. */
      worst: WorldPartMotion;
      current: number;
      maxCurrent: number;
    }
  >;
  supplies: Record<
    string,
    {
      voltage: number;
      minVoltage: number;
      current: number;
      maxCurrent: number;
    }
  >;
  boards: Record<
    string,
    {
      pins: WorldPinState;
      running: boolean;
      /** In brownout at t. */
      brownout: boolean;
      /** In brownout at any step of the window. */
      brownoutAny: boolean;
    }
  >;
};

export type RecordingEvent =
  | {
      t: number;
      kind: "serial";
      board: string;
      text: string;
      /** Byte offsets in that board's stream, half-open [from, to). */
      from: number;
      to: number;
    }
  | {
      t: number;
      kind: "serial-send";
      board: string;
      text: string;
      by: WorldSender;
    }
  | { t: number; kind: "fault"; board: string; message: string }
  | { t: number; kind: "reset"; board: string }
  | { t: number; kind: "reboot"; board: string }
  | { t: number; kind: "reload"; board: string }
  | { t: number; kind: "play"; by: WorldSender }
  | { t: number; kind: "pause"; by: WorldSender };

export type RecordingRead = {
  id: string;
  from: number;
  to: number;
  frameMs: number;
  frames: RecordedFrame[];
  events: RecordingEvent[];
};

/** One numeric series for the strip. `t` and `v` are the same length. */
export type TimelineTrack = {
  id: string;
  /** `deg` for a joint or a servo command, `V` for a supply. */
  unit: "deg" | "V";
  t: number[];
  /** Picked frame: joint degrees, supply volts, or the command in degrees. */
  v: (number | null)[];
  /** Window minimum, when the series has one (supply voltage). */
  lo?: number[];
};

/** Resets, reloads, faults, and serial lines. Times are seconds. */
export type TimelineMarker = {
  t: number;
  kind: "reset" | "reload" | "fault" | "serial";
  board?: string;
  text?: string;
};
