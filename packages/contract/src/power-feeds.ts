/**
 * Which supply reaches a board or a part. Wires are direct pin-to-pin
 * pairs: walk power pins only, pin first and then supplies in document
 * order. The first supply whose positive pin is on that pin's reachable
 * set wins. A device with no supply is null.
 */

import {
  boardModel,
  MILESTONE_SUPPLY_PRESET,
  partModel,
  supplyPresets,
  type WorldPin,
} from "./world";

export type PowerFeedDocument = {
  boards: readonly { id: string; board: string }[];
  parts: readonly { id: string; model: string }[];
  supplies: readonly { id: string }[];
  wires: readonly (readonly [string, string])[];
};

export type PowerFeeds = {
  boards: Record<string, string | null>;
  parts: Record<string, string | null>;
};

function splitEndpoint(endpoint: string): { id: string; pin: string } | null {
  const dot = endpoint.indexOf(".");
  if (dot <= 0 || dot >= endpoint.length - 1) return null;
  return { id: endpoint.slice(0, dot), pin: endpoint.slice(dot + 1) };
}

function pinOf(
  doc: PowerFeedDocument,
  id: string,
  pin: string
): WorldPin | null {
  const board = doc.boards.find((item) => item.id === id);
  if (board) return boardModel(board.board)?.pins[pin] ?? null;
  const part = doc.parts.find((item) => item.id === id);
  if (part) return partModel(part.model)?.pins[pin] ?? null;
  const supply = doc.supplies.find((item) => item.id === id);
  if (supply) return supplyPresets[MILESTONE_SUPPLY_PRESET].pins[pin] ?? null;
  return null;
}

/** Edges whose two ends are both `kind`. Unknown pins are left out. */
export function wireAdjacency(
  doc: PowerFeedDocument,
  kind: "power" | "ground"
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const wire of doc.wires) {
    const left = splitEndpoint(wire[0]);
    const right = splitEndpoint(wire[1]);
    if (!left || !right) continue;
    const leftPin = pinOf(doc, left.id, left.pin);
    const rightPin = pinOf(doc, right.id, right.pin);
    if (leftPin?.kind !== kind || rightPin?.kind !== kind) continue;
    link(wire[0], wire[1]);
    link(wire[1], wire[0]);
  }
  return map;
}

export function reachableEndpoints(
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

function supplyOn(doc: PowerFeedDocument, reached: Set<string>): string | null {
  const positive = supplyPresets[MILESTONE_SUPPLY_PRESET].positivePin;
  for (const supply of doc.supplies) {
    if (reached.has(`${supply.id}.${positive}`)) return supply.id;
  }
  return null;
}

function firstFeed(
  doc: PowerFeedDocument,
  starts: readonly string[],
  adjacent: Map<string, string[]>
): string | null {
  for (const start of starts) {
    const feed = supplyOn(doc, reachableEndpoints(start, adjacent));
    if (feed) return feed;
  }
  return null;
}

/** Supply id for each board and part, or null when nothing feeds it. */
export function powerFeeds(doc: PowerFeedDocument): PowerFeeds {
  const adjacent = wireAdjacency(doc, "power");
  const boards: Record<string, string | null> = {};
  for (const board of doc.boards) {
    const model = boardModel(board.board);
    const starts = (model?.powerInputs ?? []).map(
      (pin) => `${board.id}.${pin}`
    );
    boards[board.id] = firstFeed(doc, starts, adjacent);
  }
  const parts: Record<string, string | null> = {};
  for (const part of doc.parts) {
    const model = partModel(part.model);
    const starts = Object.entries(model?.pins ?? {})
      .filter(([, pin]) => pin.kind === "power")
      .map(([pin]) => `${part.id}.${pin}`);
    parts[part.id] = firstFeed(doc, starts, adjacent);
  }
  return { boards, parts };
}
