// Ported from layered-sim E2 src/circuit.ts and src/couple.ts @ 8731557.
/**
 * One supply rail solved with the motor stamps.
 * The circuit is built once. A step only changes the fixed load, each
 * bridge ratio, each held speed, and, when the Uno path is on, the fuse
 * resistance after the electrical solve.
 *
 * L = 0 and no board path is one backward-Euler step per millisecond.
 * A board path (it has capacitors) or L > 0 is 10 backward-Euler steps
 * with ω and the bridge ratio held. The fuse temperature moves once per
 * millisecond, after those steps, not inside them.
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
import {
  createUnoUsbPath,
  type PtcFuse,
  UNO_BOARD_NODE,
  UNO_TERM_NODE,
} from "./power-path";

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
  /**
   * Default `none`: the supply terminal is the rail, as in the closed form.
   * `uno-usb` inserts the Uno cable between the terminal and the board node.
   */
  boardPath?: "none" | "uno-usb";
};

const MASTER_S = 0.001;
const SUBSTEPS = 10;

export class RailCircuit {
  readonly winding: Float64Array;
  /** True when the Uno cable sits between the terminal and the board node. */
  readonly path: boolean;
  /** Supply terminal. With no path this is the rail, and the only node. */
  voltage = 0;
  current = 0;
  /** Board node at the end of the step. Equal to `voltage` when there is no path. */
  boardVoltage = 0;
  /** Lowest board-node voltage across the sub-steps. The end voltage on the first solve. */
  boardMinVoltage = 0;
  /** Electrical steps inside one 1 ms master step. */
  readonly substeps: number;
  /** Frozen-factor steps during the last master step. */
  lastFrozen = 0;
  private readonly engine: Engine;
  private readonly load: CurrentLoad;
  private readonly motors: BridgeMotor[];
  private readonly termNode: string;
  private readonly boardNode: string;
  private readonly fuse: PtcFuse | null;
  private readonly fuseR: { ohms: number } | null;
  private ready = false;

  constructor(spec: RailCircuitSpec) {
    const braking = spec.braking ?? "clip";
    const board = spec.boardPath === "uno-usb";
    this.path = board;
    this.termNode = board ? UNO_TERM_NODE : "rail";
    this.boardNode = board ? UNO_BOARD_NODE : "rail";
    let inductive = false;
    const motors: BridgeMotor[] = [];
    for (let i = 0; i < spec.motors.length; i++) {
      const law = spec.motors[i]!;
      const inductance = law.inductance ?? 0;
      if (inductance > 0) inductive = true;
      motors.push(
        new BridgeMotor(
          `m${i}`,
          this.boardNode,
          law.resistance,
          inductance,
          law.k,
          braking
        )
      );
    }
    this.motors = motors;
    this.substeps = inductive || board ? SUBSTEPS : 1;
    this.load = new CurrentLoad("load", this.boardNode, "0");
    const supply = new TheveninLimit(
      "src",
      this.termNode,
      "0",
      spec.vNom,
      spec.rSeries,
      spec.iLimit
    );
    const path = board ? createUnoUsbPath() : null;
    this.fuse = path?.fuse ?? null;
    this.fuseR = path?.resistor ?? null;
    this.winding = new Float64Array(motors.length);
    this.engine = new Engine(
      [supply, this.load, ...motors, ...(path?.elements ?? [])],
      {
        method: "be",
        h: MASTER_S / this.substeps,
        atol: 1e-14,
        rtol: 1e-12,
      }
    );
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

  get tripped(): boolean {
    return this.fuse?.tripped ?? false;
  }

  /** Open the fuse before the next solve. No effect without a board path. */
  tripFuse(): void {
    this.fuse?.trip();
  }

  /**
   * Solve the rail. Writes the terminal, the board node, and `winding`.
   * The fuse, when there is one, takes one thermal step from this current.
   */
  solve(): void {
    const fuse = this.fuse;
    const fuseR = this.fuseR;
    if (fuse && fuseR && fuseR.ohms !== fuse.ohms) {
      fuseR.ohms = fuse.ohms;
      this.engine.dropFactor();
    }
    const frozen = this.engine.frozenSteps;
    let min = Number.POSITIVE_INFINITY;
    if (!this.ready) {
      this.engine.operatingPoint();
      this.ready = true;
      min = this.engine.voltage(this.boardNode);
    } else {
      const n = this.substeps;
      for (let k = 0; k < n; k++) {
        this.engine.stepFast();
        const v = this.engine.voltage(this.boardNode);
        if (v < min) min = v;
      }
    }
    this.lastFrozen = this.engine.frozenSteps - frozen;
    this.voltage = this.engine.voltage(this.termNode);
    this.boardVoltage = this.engine.voltage(this.boardNode);
    this.boardMinVoltage = min;
    this.current = -this.engine.branchCurrent("src");
    const motors = this.motors;
    const winding = this.winding;
    for (let i = 0; i < motors.length; i++) {
      const motor = motors[i]!;
      winding[i] = motor.connected ? this.engine.branchCurrent(motor.id) : 0;
    }
    fuse?.advance(this.current, MASTER_S);
  }
}

export function createRailCircuit(spec: RailCircuitSpec): RailCircuit {
  return new RailCircuit(spec);
}
