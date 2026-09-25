import {
  boardModel,
  MILESTONE_SUPPLY_PRESET,
  partModel,
  supplyPresets,
  type WorldDocument,
  type WorldPin,
} from "@sfab-bench/contract";

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

/**
 * Which supply feeds each board and each part. Wires are direct
 * pin-to-pin pairs (D-005): there are no net names. A supply reaches a
 * device by walking those pairs through power pins, including a board's
 * power pin (`servo.V+ → uno.5V ← usb.5V`). A device with no supply is
 * null. It draws nothing, and a board in that state does not run.
 */
export type PowerFeeds = {
  boards: Record<string, string | null>;
  parts: Record<string, string | null>;
};

function pinSpec(doc: WorldDocument, id: string, pin: string): WorldPin | null {
  const board = doc.boards.find((item) => item.id === id);
  if (board) return boardModel(board.board)?.pins[pin] ?? null;
  const part = doc.parts.find((item) => item.id === id);
  if (part) return partModel(part.model)?.pins[pin] ?? null;
  const supply = doc.supplies.find((item) => item.id === id);
  if (supply) return supplyPresets[MILESTONE_SUPPLY_PRESET].pins[pin] ?? null;
  return null;
}

function powerAdjacency(doc: WorldDocument): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  const wires = Array.isArray(doc.wires) ? doc.wires : [];
  for (const wire of wires) {
    const left = splitEndpoint(wire[0]);
    const right = splitEndpoint(wire[1]);
    if (!left || !right) continue;
    const leftPin = pinSpec(doc, left.id, left.pin);
    const rightPin = pinSpec(doc, right.id, right.pin);
    if (leftPin?.kind !== "power" || rightPin?.kind !== "power") continue;
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

function supplyOn(doc: WorldDocument, reached: Set<string>): string | null {
  const positive = supplyPresets[MILESTONE_SUPPLY_PRESET].positivePin;
  const supplies = Array.isArray(doc.supplies) ? doc.supplies : [];
  for (const supply of supplies) {
    if (reached.has(`${supply.id}.${positive}`)) return supply.id;
  }
  return null;
}

/** Supply id for each board and part, or null when nothing feeds it. */
export function powerFeeds(doc: WorldDocument): PowerFeeds {
  const boards = Array.isArray(doc.boards) ? doc.boards : [];
  const parts = Array.isArray(doc.parts) ? doc.parts : [];
  const adjacent = powerAdjacency({
    ...doc,
    boards,
    parts,
    wires: Array.isArray(doc.wires) ? doc.wires : [],
  });
  const boardFeeds: Record<string, string | null> = {};
  for (const board of boards) {
    const model = boardModel(board.board);
    const starts = (model?.powerInputs ?? []).map(
      (pin) => `${board.id}.${pin}`
    );
    let feed: string | null = null;
    for (const start of starts) {
      feed = supplyOn(doc, reachable(start, adjacent));
      if (feed) break;
    }
    boardFeeds[board.id] = feed;
  }
  const partFeeds: Record<string, string | null> = {};
  for (const part of parts) {
    const model = partModel(part.model);
    const starts = Object.entries(model?.pins ?? {})
      .filter(([, pin]) => pin.kind === "power")
      .map(([pin]) => `${part.id}.${pin}`);
    let feed: string | null = null;
    for (const start of starts) {
      feed = supplyOn(doc, reachable(start, adjacent));
      if (feed) break;
    }
    partFeeds[part.id] = feed;
  }
  return { boards: boardFeeds, parts: partFeeds };
}
