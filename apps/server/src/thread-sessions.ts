import type { DatabaseSync } from "node:sqlite";

import type { HarnessId } from "@sfab-bench/contract";

export const LOST_CONTEXT_LINE = "this conversation lost its earlier context.";

export const THREAD_SESSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS thread_sessions (
    thread_id  TEXT NOT NULL,
    harness    TEXT NOT NULL,
    state      TEXT NOT NULL,
    native_id  TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (thread_id, harness)
  );
`;

export type ResumePayload = {
  type: "resume-session";
  specificationVersion: "harness-v1";
  harnessId: string;
  data: unknown;
  continueFrom?: unknown;
};

export function applyThreadSessionsSchema(db: DatabaseSync) {
  db.exec(THREAD_SESSIONS_DDL);
}

export function stripResumeCredentials<T>(payload: T): T {
  const cloned = JSON.parse(JSON.stringify(payload)) as T;
  if (!cloned || typeof cloned !== "object") return cloned;
  const data = (cloned as { data?: unknown }).data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    delete (data as { sandboxCredentialEnvironment?: unknown })
      .sandboxCredentialEnvironment;
  }
  return cloned;
}

export function nativeIdFromResume(
  harness: HarnessId,
  payload: { data?: unknown }
): string | null {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  let raw: unknown;
  switch (harness) {
    case "codex":
      raw = rec.threadId;
      break;
    case "opencode":
      raw = rec.openCodeSessionId;
      break;
    case "cursor":
    case "grok-build":
      raw = rec.acpSessionId;
      break;
  }
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function lostContext(
  prev: string | null | undefined,
  next: string | null | undefined
): boolean {
  if (prev == null || prev === "") return false;
  if (next == null || next === "") return false;
  return prev !== next;
}

export function resumeFromStored(stored: unknown | null | undefined): {
  resumeFrom?: unknown;
} {
  if (stored == null) return {};
  return { resumeFrom: stored };
}

export function shouldPersistPark(input: {
  unfinished: boolean;
  aborted: boolean;
  continueFrom?: unknown;
}): boolean {
  if (input.unfinished || input.aborted) return false;
  if (input.continueFrom != null) return false;
  return true;
}

export function parseStoredResume(stateJson: string): unknown | null {
  try {
    return JSON.parse(stateJson) as unknown;
  } catch {
    return null;
  }
}

export function isResumePayload(value: unknown): value is ResumePayload {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    rec.type === "resume-session" &&
    rec.specificationVersion === "harness-v1" &&
    typeof rec.harnessId === "string"
  );
}

export function isUnusableResumeError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "AI_HarnessCapabilityUnsupportedError") return true;
  return /ACP lifecycle state|Lifecycle state|does not support resume|Cold ACP session restoration/i.test(
    msg
  );
}

export function saveThreadSession(
  db: DatabaseSync,
  args: {
    threadId: string;
    workspace: string;
    harness: string;
    state: unknown;
    nativeId: string | null;
  }
): boolean {
  const existing = db
    .prepare("SELECT id FROM threads WHERE id = ? AND workspace = ?")
    .get(args.threadId, args.workspace);
  if (!existing) return false;
  db.prepare(
    `INSERT INTO thread_sessions (thread_id, harness, state, native_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, harness) DO UPDATE SET
       state = excluded.state,
       native_id = excluded.native_id,
       updated_at = excluded.updated_at`
  ).run(
    args.threadId,
    args.harness,
    JSON.stringify(args.state),
    args.nativeId,
    Date.now()
  );
  return true;
}

export function loadThreadSession(
  db: DatabaseSync,
  threadId: string,
  harness: string
): { state: unknown; native_id: string | null } | null {
  const row = db
    .prepare(
      "SELECT state, native_id FROM thread_sessions WHERE thread_id = ? AND harness = ?"
    )
    .get(threadId, harness) as
    | { state: string; native_id: string | null }
    | undefined;
  if (!row) return null;
  return { state: parseStoredResume(row.state), native_id: row.native_id };
}

export function dropThreadSession(
  db: DatabaseSync,
  threadId: string,
  harness: string
) {
  db.prepare(
    "DELETE FROM thread_sessions WHERE thread_id = ? AND harness = ?"
  ).run(threadId, harness);
}
