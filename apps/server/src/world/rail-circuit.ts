// Ported from layered-sim E2 src/circuit.ts and src/couple.ts @ 8731557.
/**
 * One supply rail solved with the motor stamps.
 * The circuit is built once. A step only changes the fixed load, each
 * bridge ratio, and each held speed.
 *
 * L = 0 is one backward-Euler step per millisecond, the algebraic law.
 * L > 0 is scheme (b): 10 backward-Euler steps with ω held.
 * Implicit damping (E2 scheme (d)) is not applied here. It would stamp
 * ω = 0 and add B(s) on the joint.
 */

import {
  type Braking,
  BridgeMotor,
  CurrentLoad,
  TheveninLimit,
} from "./circuit/elements";
import { Engine } from "./circuit/engine";

export type { Braking };

/** Which rail law the worker runs. Not a World v1 field. */
export type RailEngine = "closed-form" | "circuit";

export type RailMotorLaw = {
  resistance: number;
  /** V·s/rad. */
  k: number;
  /** Henries. Absent or 0 is the algebraic winding. */
  inductance?: number;
};

export type RailCircuitSpec = {
  vNom: number;
  rSeries: number;
  iLimit: number;
  motors: readonly RailMotorLaw[];
  /** Default `clip`, matching `solveRail`. */
  braking?: Braking;
};

const MASTER_S = 0.001;
const SUBSTEPS = 10;

export class RailCircuit {
  readonly winding: Float64Array;
  voltage = 0;
  current = 0;
  /** Electrical steps inside one 1 ms master step. */
  readonly substeps: number;
  /** Frozen-factor steps during the last master step. */
  lastFrozen = 0;
  private readonly engine: Engine;
  private readonly load: CurrentLoad;
  private readonly motors: BridgeMotor[];
  private ready = false;

  constructor(spec: RailCircuitSpec) {
    const braking = spec.braking ?? "clip";
    let inductive = false;
    const motors: BridgeMotor[] = [];
    for (let i = 0; i < spec.motors.length; i++) {
      const law = spec.motors[i]!;
      const inductance = law.inductance ?? 0;
      if (inductance > 0) inductive = true;
      motors.push(
        new BridgeMotor(
          `m${i}`,
          "rail",
          law.resistance,
          inductance,
          law.k,
          braking
        )
      );
    }
    this.motors = motors;
    this.substeps = inductive ? SUBSTEPS : 1;
    this.load = new CurrentLoad("load", "rail", "0");
    const supply = new TheveninLimit(
      "src",
      "rail",
      "0",
      spec.vNom,
      spec.rSeries,
      spec.iLimit
    );
    this.winding = new Float64Array(motors.length);
    this.engine = new Engine([supply, this.load, ...motors], {
      method: "be",
      h: MASTER_S / this.substeps,
      atol: 1e-14,
      rtol: 1e-12,
    });
  }

  setFixed(amps: number): void {
    this.load.amps = amps;
  }

  setMotor(
    index: number,
    fraction: number,
    omega: number,
    connected: boolean
  ): void {
    const motor = this.motors[index];
    if (!motor) throw new Error(`no motor ${index}`);
    motor.s = fraction;
    motor.omega = omega;
    motor.connected = connected;
  }

  /** Solve the rail. Writes `voltage`, `current`, and `winding`. */
  solve(): void {
    const frozen = this.engine.frozenSteps;
    if (!this.ready) {
      this.engine.operatingPoint();
      this.ready = true;
    } else {
      const n = this.substeps;
      for (let k = 0; k < n; k++) this.engine.stepFast();
    }
    this.lastFrozen = this.engine.frozenSteps - frozen;
    this.voltage = this.engine.voltage("rail");
    this.current = -this.engine.branchCurrent("src");
    const motors = this.motors;
    const winding = this.winding;
    for (let i = 0; i < motors.length; i++) {
      const motor = motors[i]!;
      winding[i] = motor.connected ? this.engine.branchCurrent(motor.id) : 0;
    }
  }
}

export function createRailCircuit(spec: RailCircuitSpec): RailCircuit {
  return new RailCircuit(spec);
}
