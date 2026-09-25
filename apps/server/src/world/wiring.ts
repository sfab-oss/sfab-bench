import {
  boardModel,
  partModel,
  type WorldDocument,
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
