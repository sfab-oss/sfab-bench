import {
  arduinoPinBit,
  boardModel,
  MILESTONE_SUPPLY_PRESET,
  partModel,
  supplyPresets,
  type WorldDocument,
  type WorldPin,
} from "@sfab-bench/contract";

export { type PowerFeeds, powerFeeds } from "@sfab-bench/contract";

/**
 * A servo signal tied straight to one board GPIO pin. Direct pairs only:
 * a wire is `["uno.D9", "servo.signal"]`, not a net of several hops.
 */
export type ServoSignalDrive = {
  partId: string;
  boardId: string;
  pin: string;
};

function splitEndpoint(endpoint: string): { id: string; pin: string } | null {
  const dot = endpoint.indexOf(".");
  if (dot <= 0 || dot >= endpoint.length - 1) return null;
  return { id: endpoint.slice(0, dot), pin: endpoint.slice(dot + 1) };
}

/**
 * Each servo whose signal pin has a direct wire to a board digital GPIO.
 * Anything else is not driven: no wire, a supply pin, or a hop through
 * another part. A0–A5 count (D-018). The first matching pair wins.
 */
export function servoSignalDrives(doc: WorldDocument): ServoSignalDrive[] {
  const parts = Array.isArray(doc.parts) ? doc.parts : [];
  const wires = Array.isArray(doc.wires) ? doc.wires : [];
  const boards = Array.isArray(doc.boards) ? doc.boards : [];
  const drives: ServoSignalDrive[] = [];
  for (const part of parts) {
    const model = partModel(part.model);
    if (model?.drive.kind !== "servo") continue;
    const signal = model.drive.pin;
    let found: ServoSignalDrive | null = null;
    for (const wire of wires) {
      const left = splitEndpoint(wire[0]);
      const right = splitEndpoint(wire[1]);
      if (!left || !right) continue;
      const other =
        left.id === part.id && left.pin === signal
          ? right
          : right.id === part.id && right.pin === signal
            ? left
            : null;
      if (!other) continue;
      const board = boards.find((item) => item.id === other.id);
      const spec = board ? boardModel(board.board)?.pins[other.pin] : undefined;
      if (!board || !spec?.digital) continue;
      found = { partId: part.id, boardId: board.id, pin: other.pin };
      break;
    }
    if (found) drives.push(found);
  }
  return drives;
}

export type GpioDriver =
  | { kind: "gpio"; boardId: string; bit: number }
  | { kind: "low" }
  | { kind: "high" };

export type GpioInputNet = {
  boardId: string;
  bit: number;
  drivers: GpioDriver[];
};

/** A board the net resolver can read an output from and drive an input on. */
export type GpioLevelBoard = {
  id: string;
  outputLevel(bit: number): boolean | null;
  setDriven(bit: number, level: boolean | null): void;
};

function endpointPin(doc: WorldDocument, endpoint: string): WorldPin | null {
  const split = splitEndpoint(endpoint);
  if (!split) return null;
  const boards = Array.isArray(doc.boards) ? doc.boards : [];
  const board = boards.find((item) => item.id === split.id);
  if (board) return boardModel(board.board)?.pins[split.pin] ?? null;
  const parts = Array.isArray(doc.parts) ? doc.parts : [];
  const part = parts.find((item) => item.id === split.id);
  if (part) return partModel(part.model)?.pins[split.pin] ?? null;
  const supplies = Array.isArray(doc.supplies) ? doc.supplies : [];
  if (supplies.some((item) => item.id === split.id)) {
    return supplyPresets[MILESTONE_SUPPLY_PRESET].pins[split.pin] ?? null;
  }
  return null;
}

/**
 * Board GPIO pins that share a wire net with another GPIO, a ground,
 * or a supply positive. Another GPIO is a driver only while its DDR
 * says output. A ground drives low and a supply positive drives high,
 * and either beats a pull-up. Catalog `output` is not consulted for a
 * GPIO: it is an output at runtime when the firmware sets DDR.
 */
export function gpioInputNets(doc: WorldDocument): GpioInputNet[] {
  const boards = Array.isArray(doc.boards) ? doc.boards : [];
  const wires = Array.isArray(doc.wires) ? doc.wires : [];
  const gpio = new Map<string, { boardId: string; bit: number }>();
  for (const board of boards) {
    const pins = boardModel(board.board)?.pins;
    if (!pins) continue;
    for (const pin of Object.keys(pins)) {
      if (!pins[pin]?.digital) continue;
      const bit = arduinoPinBit(pin);
      if (bit === undefined) continue;
      gpio.set(`${board.id}.${pin}`, { boardId: board.id, bit });
    }
  }
  const adjacent = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = adjacent.get(from);
    if (list) list.push(to);
    else adjacent.set(from, [to]);
  };
  for (const wire of wires) {
    link(wire[0], wire[1]);
    link(wire[1], wire[0]);
  }
  const out: GpioInputNet[] = [];
  for (const [endpoint, self] of gpio) {
    const seen = new Set<string>();
    const stack = [endpoint];
    const drivers: GpioDriver[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      if (current !== endpoint) {
        const pin = endpointPin(doc, current);
        if (pin?.kind === "ground") {
          drivers.push({ kind: "low" });
        } else if (pin?.kind === "power" && pin.output) {
          drivers.push({ kind: "high" });
        } else {
          const other = gpio.get(current);
          if (
            other &&
            (other.boardId !== self.boardId || other.bit !== self.bit)
          ) {
            drivers.push({
              kind: "gpio",
              boardId: other.boardId,
              bit: other.bit,
            });
          }
        }
      }
      for (const next of adjacent.get(current) ?? []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    if (drivers.length > 0) {
      out.push({ boardId: self.boardId, bit: self.bit, drivers });
    }
  }
  return out;
}

/**
 * A GPIO output wins, then a ground, then a supply positive. The worker
 * calls this from the port listener (`onPinsChanged`) before that board
 * applies pull-ups.
 */
export function applyGpioDrives(
  nets: readonly GpioInputNet[],
  boards: readonly GpioLevelBoard[]
): void {
  for (const net of nets) {
    const board = boards.find((item) => item.id === net.boardId);
    if (!board) continue;
    let level: boolean | null = null;
    for (const driver of net.drivers) {
      if (driver.kind !== "gpio") continue;
      const other = boards.find((item) => item.id === driver.boardId);
      const driven = other?.outputLevel(driver.bit);
      if (driven === null || driven === undefined) continue;
      level = driven;
      break;
    }
    if (level === null) {
      if (net.drivers.some((driver) => driver.kind === "low")) level = false;
      else if (net.drivers.some((driver) => driver.kind === "high")) {
        level = true;
      }
    }
    board.setDriven(net.bit, level);
  }
}
