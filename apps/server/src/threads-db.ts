import type { UIMessage } from "ai";

import type { SessionThreadPrefs } from "@sfab-bench/contract";
import { db } from "./db";
import {
  applyThreadSessionsSchema,
  dropThreadSession as dropThreadSessionIn,
  loadThreadSession as loadThreadSessionIn,
  saveThreadSession as saveThreadSessionIn,
} from "./thread-sessions";

export type ThreadRow = {
  id: string;
  workspace: string;
  title: string;
  created_at: number;
  updated_at: number;
  owner: string | null;
  harness: string | null;
  model: string | null;
  effort: string | null;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    workspace TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES threads(id)
  );
  CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, created_at);
`);

const threadCols = db.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
if (!threadCols.some((col) => col.name === "owner")) {
  db.exec("ALTER TABLE threads ADD COLUMN owner TEXT");
}
if (!threadCols.some((col) => col.name === "harness")) {
  db.exec("ALTER TABLE threads ADD COLUMN harness TEXT");
}
if (!threadCols.some((col) => col.name === "model")) {
  db.exec("ALTER TABLE threads ADD COLUMN model TEXT");
}
if (!threadCols.some((col) => col.name === "effort")) {
  db.exec("ALTER TABLE threads ADD COLUMN effort TEXT");
}

applyThreadSessionsSchema(db);

const THREAD_SELECT =
  "SELECT id, workspace, title, created_at, updated_at, owner, harness, model, effort FROM threads";

export function listThreads(workspace: string): ThreadRow[] {
  return db
    .prepare(`${THREAD_SELECT} WHERE workspace = ? ORDER BY updated_at DESC`)
    .all(workspace) as ThreadRow[];
}

export function getThread(id: string, workspace: string) {
  const thread = db
    .prepare(`${THREAD_SELECT} WHERE id = ? AND workspace = ?`)
    .get(id, workspace) as ThreadRow | undefined;
  if (!thread) return null;
  const rows = db
    .prepare("SELECT id, role, parts, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
    .all(id) as { id: string; role: string; parts: string; created_at: number }[];
  const messages: UIMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: JSON.parse(row.parts) as UIMessage["parts"],
  }));
  return { thread, messages };
}

export function createThread(workspace: string, prefs?: SessionThreadPrefs): ThreadRow {
  const now = Date.now();
  const row: ThreadRow = {
    id: crypto.randomUUID(),
    workspace,
    title: "New chat",
    created_at: now,
    updated_at: now,
    owner: null,
    harness: prefs?.harness ?? null,
    model: prefs?.model ?? null,
    effort: prefs?.effort ?? null,
  };
  db.prepare(
    "INSERT INTO threads (id, workspace, title, created_at, updated_at, owner, harness, model, effort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(row.id, row.workspace, row.title, row.created_at, row.updated_at, row.owner, row.harness, row.model, row.effort);
  return row;
}

export function saveThreadPrefs(id: string, workspace: string, prefs: SessionThreadPrefs) {
  const result = db
    .prepare("UPDATE threads SET harness = ?, model = ?, effort = ?, updated_at = ? WHERE id = ? AND workspace = ?")
    .run(prefs.harness, prefs.model, prefs.effort, Date.now(), id, workspace);
  return result.changes > 0;
}

function titleFrom(messages: UIMessage[]) {
  const firstUser = messages.find((m) => m.role === "user");
  const titleFrom = firstUser?.parts?.find((p) => p.type === "text" && "text" in p);
  if (!titleFrom || !("text" in titleFrom)) return "New chat";
  const text = String(titleFrom.text)
    .split("\n")
    .filter((line) => !line.startsWith("[viewer]"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return text || "New chat";
}

export function saveMessages(id: string, workspace: string, messages: UIMessage[]) {
  const existing = db.prepare("SELECT id FROM threads WHERE id = ? AND workspace = ?").get(id, workspace);
  if (!existing) return false;
  const now = Date.now();
  const title = titleFrom(messages);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM messages WHERE thread_id = ?").run(id);
    const insert = db.prepare(
      "INSERT INTO messages (id, thread_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const [i, msg] of messages.entries()) {
      insert.run(msg.id, id, msg.role, JSON.stringify(msg.parts ?? []), now + i);
    }
    db.prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?").run(title, now, id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

export function saveThreadSession(
  threadId: string,
  workspace: string,
  harness: string,
  state: unknown,
  nativeId: string | null,
) {
  return saveThreadSessionIn(db, { threadId, workspace, harness, state, nativeId });
}

export function loadThreadSession(threadId: string, harness: string) {
  return loadThreadSessionIn(db, threadId, harness);
}

export function dropThreadSession(threadId: string, harness: string) {
  dropThreadSessionIn(db, threadId, harness);
}
