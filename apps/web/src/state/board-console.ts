import { useSyncExternalStore } from "react";

export type BoardConsoleEntry =
  | { kind: "out"; text: string }
  | { kind: "sent"; text: string; by: string };

export type BoardTranscript = {
  next: number;
  entries: BoardConsoleEntry[];
};

export type BoardConsoleSnapshot = {
  boards: Record<string, BoardTranscript>;
  /** Rejected send, shown only to the client that sent it. */
  rejects: Record<string, string>;
};

const empty: BoardConsoleSnapshot = { boards: {}, rejects: {} };
let snapshot: BoardConsoleSnapshot = empty;
const listeners = new Set<() => void>();

function emit(next: BoardConsoleSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function row(board: string): BoardTranscript {
  return snapshot.boards[board] ?? { next: 0, entries: [] };
}

export function resetBoardConsole() {
  if (snapshot === empty) return;
  emit(empty);
}

export function appendBoardSerial(board: string, text: string, next: number) {
  const current = row(board);
  if (next <= current.next) return;
  if (!text) {
    emit({
      ...snapshot,
      boards: { ...snapshot.boards, [board]: { ...current, next } },
    });
    return;
  }
  const entries = current.entries.slice();
  const last = entries[entries.length - 1];
  if (last?.kind === "out") {
    entries[entries.length - 1] = { kind: "out", text: last.text + text };
  } else {
    entries.push({ kind: "out", text });
  }
  emit({
    ...snapshot,
    boards: {
      ...snapshot.boards,
      [board]: { next, entries },
    },
  });
}

export function noteBoardReject(board: string, message: string) {
  emit({
    ...snapshot,
    rejects: { ...snapshot.rejects, [board]: message },
  });
}

export function clearBoardReject(board: string) {
  if (!snapshot.rejects[board]) return;
  const rejects = { ...snapshot.rejects };
  delete rejects[board];
  emit({ ...snapshot, rejects });
}

export function noteBoardSent(board: string, text: string, by: string) {
  const current = row(board);
  emit({
    ...snapshot,
    boards: {
      ...snapshot.boards,
      [board]: {
        next: current.next,
        entries: [...current.entries, { kind: "sent", text, by }],
      },
    },
  });
}

export function boardConsoleSnapshot(): BoardConsoleSnapshot {
  return snapshot;
}

export function useBoardConsole(): BoardConsoleSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    boardConsoleSnapshot,
    boardConsoleSnapshot
  );
}
