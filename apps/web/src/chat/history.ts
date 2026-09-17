import { parseCadRefs } from "@/chat/cad-refs";
import { stripViewerStamp } from "@/chat/composer-recovery";

export const EMPTY_THREAD_TITLE = "New chat";

export type TitleSegment =
  | { type: "text"; value: string }
  | { type: "ref"; ref: string; label: string };

export type ThreadPip = "streaming" | "ask-user" | "error" | null;

export type NewChatAction =
  | { action: "focus" }
  | { action: "open"; id: string }
  | { action: "create" };

const MINUTE_MS = 60_000;

export function isEmptyHistoryTitle(title: string): boolean {
  const text = title.trim();
  return text === "" || text === EMPTY_THREAD_TITLE;
}

export function titleRefSegments(
  title: string,
  labelForRef: (ref: string) => string | null
): TitleSegment[] {
  const hits = parseCadRefs(title);
  if (hits.length === 0) return title ? [{ type: "text", value: title }] : [];
  const out: TitleSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor)
      out.push({ type: "text", value: title.slice(cursor, hit.start) });
    const label = labelForRef(hit.ref);
    out.push({ type: "ref", ref: hit.ref, label: label ?? hit.ref });
    cursor = hit.end;
  }
  if (cursor < title.length)
    out.push({ type: "text", value: title.slice(cursor) });
  return out;
}

/** Relative `updated_at`. */
export function formatRelativeTime(updatedAt: number, nowMs: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "";
  const diff = nowMs - updatedAt;
  if (diff < MINUTE_MS) return "just now";
  const minutes = Math.floor(diff / MINUTE_MS);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function firstUserLine(
  messages: { role?: string; parts?: { type?: string; text?: string }[] }[]
): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = stripViewerStamp(
      (message.parts ?? [])
        .flatMap((part) =>
          part.type === "text" && part.text ? [part.text] : []
        )
        .join("\n")
    );
    if (!text) continue;
    const line = text
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean);
    if (line) return line;
  }
  return null;
}

/** Live session wins; until that ChatSession has written the ref, use initialMessages. */
export function currentThreadIsEmpty(input: {
  threadId: string | null;
  liveThreadId: string | null;
  liveCount: number;
  initialCount: number;
}): boolean {
  if (!input.threadId) return false;
  if (input.liveThreadId === input.threadId) return input.liveCount === 0;
  return input.initialCount === 0;
}

export function emptyReuseCandidates(input: {
  currentId: string | null;
  threads: { id: string; title: string; updated_at: number }[];
  skipIds?: Iterable<string>;
  rejectedIds?: Iterable<string>;
}): string[] {
  const skip = new Set(input.skipIds);
  for (const id of input.rejectedIds ?? []) skip.add(id);
  if (input.currentId) skip.add(input.currentId);
  return input.threads
    .filter((row) => isEmptyHistoryTitle(row.title) && !skip.has(row.id))
    .slice()
    .sort((a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id))
    .map((row) => row.id);
}

/**
 * Next + action from local data. `action: "open"` is a candidate — the caller
 * must GET that thread and require `messages.length === 0` before switching.
 */
export function decideNewChatAction(input: {
  currentId: string | null;
  currentEmpty: boolean;
  threads: { id: string; title: string; updated_at: number }[];
  skipIds?: Iterable<string>;
  rejectedIds?: Iterable<string>;
}): NewChatAction {
  if (input.currentEmpty && input.currentId) return { action: "focus" };
  const id = emptyReuseCandidates(input)[0];
  if (id) return { action: "open", id };
  return { action: "create" };
}

export function partitionHistoryRows<T extends { id: string; title: string }>(
  rows: T[],
  currentId: string | null,
  currentEmpty: boolean
): { visible: T[]; emptyHidden: T[] } {
  const visible: T[] = [];
  const emptyHidden: T[] = [];
  for (const row of rows) {
    const empty =
      row.id === currentId ? currentEmpty : isEmptyHistoryTitle(row.title);
    if (empty && row.id !== currentId) emptyHidden.push(row);
    else visible.push(row);
  }
  return { visible, emptyHidden };
}

export function threadRowPip(input: {
  rowId: string;
  currentId: string | null;
  streaming: boolean;
  askUser: boolean;
  error: boolean;
}): ThreadPip {
  if (input.rowId !== input.currentId) return null;
  if (input.streaming) return "streaming";
  if (input.askUser) return "ask-user";
  if (input.error) return "error";
  return null;
}
