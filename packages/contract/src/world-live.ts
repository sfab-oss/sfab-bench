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

export type WorldState = {
  /** Seconds of simulation since the run was loaded or reloaded. */
  simTime: number;
  playing: boolean;
  /** robot id → link name → world pose of that body. */
  poses: Record<string, Record<string, WorldLinkPose>>;
  /** robot id → joint name → joint position in radians. */
  joints: Record<string, Record<string, number>>;
};

/**
 * Who sent play or pause. A principal is its kind plus the device label
 * the session already shows. The agent has no device.
 */
export type WorldSender =
  | { kind: "loopback"; label: string }
  | { kind: "paired"; label: string }
  | { kind: "account"; label: string }
  | { kind: "agent" };

/** What a client may send on the world socket. `step` is loopback only. */
export type WorldClientMessage =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step"; n: number };

export type WorldServerMessage =
  | { type: "state"; state: WorldState }
  | { type: "command"; command: "play" | "pause"; by: WorldSender }
  | { type: "reloaded" }
  | { type: "error"; errors: WorldError[]; message?: string };
