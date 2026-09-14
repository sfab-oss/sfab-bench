import type { UIMessage } from "ai";

import {
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
  isChatEffort,
  isHarnessId,
  type ChatEffort,
  type HarnessId,
} from "@sfab-bench/contract";
import type {
  ProjectSession,
  SessionClient,
  SessionDoc,
  SessionEvent,
  SessionSelection,
  SessionSnapshot,
  SessionStatus,
  SessionThreadPrefs,
} from "@sfab-bench/contract";
import { resolveArtifact, shownUrl } from "./cad-pkg";
import { getPrincipal, type ClientPrincipal } from "./principal";
import { currentProject, projectPath, setLastFile } from "./projects";
import { createThread, getThread, listThreads, saveMessages, saveThreadPrefs } from "./threads-db";

export type SessionSocket = { send: (data: string) => void };

const sockets = new Set<SessionSocket>();

const defaultPrefs = (): SessionThreadPrefs => ({
  harness: DEFAULT_HARNESS,
  model: DEFAULT_HARNESS_MODEL[DEFAULT_HARNESS],
  effort: DEFAULT_CHAT_EFFORT,
});

let state: ProjectSession = {
  project: { path: "" },
  doc: { file: null, rev: 0, selection: null },
  threadId: null,
  thread: defaultPrefs(),
  status: "idle",
};

let messages: UIMessage[] = [];
let run: AbortController | null = null;
let threadTimer: ReturnType<typeof setTimeout> | null = null;
let pendingThread: Extract<SessionEvent, { type: "thread" }> | null = null;

export function clientOf(principal: ClientPrincipal): SessionClient {
  if (principal.kind === "loopback") return { id: "loopback", label: "Mac" };
  if (principal.kind === "paired") return { id: principal.deviceId, label: principal.label || "Quest" };
  return { id: principal.deviceId, label: "Account" };
}

function emit(event: SessionEvent, except?: SessionSocket) {
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket === except) continue;
    try {
      socket.send(payload);
    } catch {
      sockets.delete(socket);
    }
  }
}

function flushThread() {
  if (threadTimer) {
    clearTimeout(threadTimer);
    threadTimer = null;
  }
  if (!pendingThread) return;
  const event = pendingThread;
  pendingThread = null;
  emit(event);
}

function publishThread(next: UIMessage[], status: SessionStatus, immediate = false) {
  messages = next;
  state = { ...state, status };
  pendingThread = { type: "thread", threadId: state.threadId ?? "", messages: next, status };
  if (immediate) {
    flushThread();
    return;
  }
  if (threadTimer) return;
  threadTimer = setTimeout(() => {
    threadTimer = null;
    flushThread();
  }, 50);
}

export function subscribeSession(socket: SessionSocket) {
  sockets.add(socket);
  return () => {
    sockets.delete(socket);
  };
}

export function sessionState(): ProjectSession {
  return state;
}

export function sessionMessages(): UIMessage[] {
  return messages;
}

export function snapshotFor(principal: ClientPrincipal): SessionSnapshot {
  return { ...state, messages, you: clientOf(principal) };
}

export function sendSnapshot(socket: SessionSocket, principal: ClientPrincipal) {
  socket.send(JSON.stringify({ type: "snapshot", session: snapshotFor(principal) } satisfies SessionEvent));
}

function prefsFromThread(row: { harness: string | null; model: string | null; effort: string | null }): SessionThreadPrefs {
  const harnessRaw = row.harness ?? "";
  const effortRaw = row.effort ?? "";
  const harness: HarnessId = isHarnessId(harnessRaw) ? harnessRaw : state.thread.harness;
  const model =
    typeof row.model === "string" && row.model.trim() ? row.model.trim() : DEFAULT_HARNESS_MODEL[harness];
  const effort: ChatEffort = isChatEffort(effortRaw) ? effortRaw : DEFAULT_CHAT_EFFORT;
  return { harness, model, effort };
}

function loadThread(id: string | null) {
  if (!id) {
    state = { ...state, threadId: null };
    messages = [];
    return;
  }
  try {
    const row = getThread(id, projectPath());
    if (!row) {
      state = { ...state, threadId: null };
      messages = [];
      return;
    }
    state = { ...state, threadId: id, thread: prefsFromThread(row.thread) };
    messages = row.messages;
  } catch {
    state = { ...state, threadId: id };
  }
}

/** Rebuild from the open project. Called on boot and when the folder changes. */
export function hydrateSession() {
  flushThread();
  if (run) {
    run.abort();
    run = null;
  }
  const project = currentProject();
  const path = project?.path ?? "";
  let threadId: string | null = null;
  let thread = defaultPrefs();
  let loaded: UIMessage[] = [];
  if (path) {
    try {
      const rows = listThreads(path);
      const first = rows[0];
      if (first) {
        const full = getThread(first.id, path);
        threadId = first.id;
        if (full) {
          thread = prefsFromThread(full.thread);
          loaded = full.messages;
        }
      }
    } catch {
      /* sqlite may be empty in tests */
    }
  }
  state = {
    project: { path },
    doc: { file: project?.lastFile ?? null, rev: 0, selection: null },
    threadId,
    thread,
    status: "idle",
  };
  messages = loaded;
  emit({ type: "snapshot", session: { ...state, messages } });
}

export function setSessionDoc(file: string | null, opts: { reload?: boolean; skipResolve?: boolean } = {}) {
  let next = file?.trim() ? file.trim().replace(/^\/+/, "") : null;
  if (next && !opts.skipResolve) {
    const resolved = resolveArtifact(next);
    if ("error" in resolved) throw Object.assign(new Error(resolved.error), { status: 400 });
    next = shownUrl(resolved);
  }
  const same = state.doc.file === next;
  if (same && !opts.reload) return state.doc;
  const rev = same ? state.doc.rev + 1 : state.doc.rev + 1;
  const selection = same ? state.doc.selection : null;
  const doc: SessionDoc = { file: next, rev, selection };
  state = { ...state, doc };
  try {
    setLastFile(next);
  } catch {
    /* no project in unit tests */
  }
  emit({ type: "doc", doc });
  return doc;
}

export function setSessionSelection(ref: string | null, name?: string, principal?: ClientPrincipal) {
  const who = principal ?? getPrincipal();
  const client = who ? clientOf(who) : { id: "unknown", label: "Unknown" };
  const trimmed = ref?.trim() || null;
  let selection: SessionSelection = null;
  if (trimmed) {
    selection = {
      ref: trimmed,
      name: name?.trim() || trimmed,
      by: client.id,
      byLabel: client.label,
      at: Date.now(),
    };
  }
  const prev = state.doc.selection;
  if ((prev?.ref ?? null) === (selection?.ref ?? null) && (prev?.by ?? null) === (selection?.by ?? null)) {
    return state.doc;
  }
  const doc: SessionDoc = { ...state.doc, selection };
  state = { ...state, doc };
  emit({ type: "doc", doc });
  return doc;
}

export function ensureSessionThread() {
  if (state.threadId) {
    const existing = (() => {
      try {
        return getThread(state.threadId, projectPath());
      } catch {
        return null;
      }
    })();
    if (existing) return { id: state.threadId, created: false };
  }
  try {
    const path = projectPath();
    const rows = listThreads(path);
    if (rows[0]) {
      loadThread(rows[0].id);
      emit({ type: "thread", threadId: rows[0].id, messages, status: state.status });
      emit({ type: "prefs", threadId: rows[0].id, thread: state.thread });
      return { id: rows[0].id, created: false };
    }
    const row = createThread(path, state.thread);
    loadThread(row.id);
    emit({ type: "thread", threadId: row.id, messages: [], status: "idle" });
    emit({ type: "prefs", threadId: row.id, thread: state.thread });
    return { id: row.id, created: true };
  } catch (err) {
    throw err;
  }
}

export function setSessionThread(id: string) {
  if (state.status !== "idle") {
    throw Object.assign(new Error("wait for the current reply to finish"), { status: 409 });
  }
  loadThread(id);
  if (state.threadId !== id) {
    throw Object.assign(new Error("not found"), { status: 404 });
  }
  emit({ type: "thread", threadId: id, messages, status: "idle" });
  emit({ type: "prefs", threadId: id, thread: state.thread });
  return { id, messages, thread: state.thread };
}

export function setSessionPrefs(patch: Partial<SessionThreadPrefs>) {
  const harness = patch.harness && isHarnessId(patch.harness) ? patch.harness : state.thread.harness;
  const model =
    typeof patch.model === "string" && patch.model.trim()
      ? patch.model.trim()
      : patch.harness && patch.harness !== state.thread.harness
        ? DEFAULT_HARNESS_MODEL[harness]
        : state.thread.model;
  const effort = patch.effort && isChatEffort(patch.effort) ? patch.effort : state.thread.effort;
  const thread: SessionThreadPrefs = { harness, model, effort };
  state = { ...state, thread };
  if (state.threadId) {
    try {
      saveThreadPrefs(state.threadId, projectPath(), thread);
    } catch {
      /* tests */
    }
  }
  emit({ type: "prefs", threadId: state.threadId ?? "", thread });
  return thread;
}

export function startSessionRun(): AbortController | null {
  if (state.status !== "idle") return null;
  run?.abort();
  run = new AbortController();
  state = { ...state, status: "submitted" };
  return run;
}

export function setSessionRunStatus(status: SessionStatus) {
  state = { ...state, status };
}

export function endSessionRun() {
  run = null;
  state = { ...state, status: "idle" };
}

export function stopSessionRun() {
  run?.abort();
}

export function publishSessionThread(next: UIMessage[], status: SessionStatus, immediate = false) {
  publishThread(next, status, immediate);
}

export function persistSessionThread(next: UIMessage[]) {
  messages = next;
  if (!state.threadId) return;
  try {
    saveMessages(state.threadId, projectPath(), next);
  } catch {
    /* tests */
  }
}

export function viewerStamp() {
  const file = state.doc.file ?? "";
  const selected = state.doc.selection;
  return {
    file,
    selected: selected?.ref ?? null,
    selectedName: selected?.name ?? null,
    empty: !file,
  };
}
