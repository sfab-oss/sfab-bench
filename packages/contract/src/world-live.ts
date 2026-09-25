/**
 * The shared world run (ADR 0009, D-015). One document, one sim.
 * Camera and scrub stay on the client; these messages do not carry them.
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

/** One board in the shared run. Pins are not on this snapshot. */
export type WorldBoardState = {
  /**
   * The firmware image is loaded. While the run is paused the CPU does
   * not advance, and `running` stays true. A fault clears it.
   */
  running: boolean;
  /** Why this board is stopped. The rest of the run keeps going. */
  fault?: string;
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
  | { type: "serial-send"; board: string; text: string; nonce?: string };

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
    };
