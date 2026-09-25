/**
 * Supply budget (ADR 0009, D-017). Currents come from the part-model
 * catalog. This module does not step physics and does not read files.
 *
 * Voltage for a step is computed from the previous step's part states.
 * This step's speed, torque, and brownout then follow that voltage, and
 * the current they produce is only used on the next step. There is no
 * algebraic loop between the joint and the rail.
 */

import type { WorldPartMotion } from "@sfab-bench/contract";

export type { WorldPartMotion };

/**
 * `V_nom` while `current` is at or under the limit. Above it,
 * `V_nom − rDroop · (current − currentLimit)`, clamped at 0.
 * `current` is amperes drawn on the previous step.
 */
export function supplyVoltage(
  nominalVoltage: number,
  currentLimit: number,
  rDroop: number,
  current: number
): number {
  if (!(current > currentLimit)) return nominalVoltage;
  const sagged = nominalVoltage - rDroop * (current - currentLimit);
  return sagged > 0 ? sagged : 0;
}

/**
 * `voltageScale: "V/V_nom"`. `nominalVoltage` is the part model's
 * `supply.nominal`. At 0 V, or with no nominal, the result is 0.
 */
export function scaleWithVoltage(
  nominal: number,
  voltage: number,
  nominalVoltage: number
): number {
  if (!(nominalVoltage > 0) || !(voltage > 0)) return 0;
  return (nominal * voltage) / nominalVoltage;
}

export type StallRule = {
  minAngleErrorDeg: number;
  maxVelocityDegPerSec: number;
  holdMs: number;
};

export type MotionCurrents = {
  idle: number;
  moving: number;
  stall: number;
};

/**
 * One step of the servo's electrical state. Thresholds and currents are
 * the part model's, not literals here. Limp (no signal) is idle and
 * clears the stall hold. A sample that misses either stall condition
 * clears the hold too, so a fast joint or a small error starts it over.
 */
export function stepPartMotion(input: {
  holdMs: number;
  limp: boolean;
  /** The setpoint has not reached the command yet. */
  slewing: boolean;
  commandDeg: number | null;
  measuredDeg: number;
  velocityDegPerSec: number;
  stall: StallRule;
  current: MotionCurrents;
  /** Sim milliseconds this step covers. The stall hold is in the same unit. */
  dtMs: number;
}): { state: WorldPartMotion; holdMs: number; current: number } {
  if (input.limp || input.commandDeg === null) {
    return { state: "idle", holdMs: 0, current: input.current.idle };
  }
  const error = Math.abs(input.commandDeg - input.measuredDeg);
  const wide = error > input.stall.minAngleErrorDeg;
  const slow =
    Math.abs(input.velocityDegPerSec) < input.stall.maxVelocityDegPerSec;
  const holdMs = wide && slow ? input.holdMs + input.dtMs : 0;
  if (wide && slow && holdMs >= input.stall.holdMs) {
    return { state: "stall", holdMs, current: input.current.stall };
  }
  if (input.slewing || wide) {
    return { state: "moving", holdMs, current: input.current.moving };
  }
  return { state: "idle", holdMs, current: input.current.idle };
}
