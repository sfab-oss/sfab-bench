import type { ProjectSession, SessionClient, SessionEvent, SessionSnapshot, SessionStatus } from "@sfab-bench/contract";
import { getPrincipal, type ClientPrincipal } from "./principal";
import {
  catalogRevision,
  currentProject,
  listFileRecents,
  touchFileRecent,
} from "./projects";

export type SessionSocket = { send: (data: string) => void };

const sockets = new Set<SessionSocket>();

let state: ProjectSession = {
  project: { path: "" },
  fileRecents: [],
};

let run: AbortController | null = null;
let status: SessionStatus = "idle";

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

function libraryEvent(): Extract<SessionEvent, { type: "library" }> {
  return {
    type: "library",
    project: { path: state.project.path },
    fileRecents: state.fileRecents,
    revision: catalogRevision(),
  };
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

export function sessionStatus(): SessionStatus {
  return status;
}

export function snapshotFor(principal?: ClientPrincipal): SessionSnapshot {
  const who = principal ?? getPrincipal();
  return { ...state, you: who ? clientOf(who) : undefined };
}

export function sendSnapshot(socket: SessionSocket, principal: ClientPrincipal) {
  socket.send(JSON.stringify({ type: "snapshot", session: snapshotFor(principal) } satisfies SessionEvent));
}

function readLibrary() {
  const project = currentProject();
  state = {
    project: { path: project?.path ?? "" },
    fileRecents: listFileRecents(),
  };
}

/** Rebuild from the open project. Called on boot and when the folder changes. */
export function hydrateSession() {
  if (run) {
    run.abort();
    run = null;
  }
  status = "idle";
  readLibrary();
  emit({ type: "snapshot", session: { ...state } });
}

/** Shared recents only — does not load the file on any client. */
export function rememberOpenedFile(rel: string) {
  const fileRecents = touchFileRecent(rel);
  if (state.project.path) {
    state = { ...state, fileRecents };
    emit(libraryEvent());
  }
  return fileRecents;
}

export function startSessionRun(): AbortController | null {
  if (status !== "idle") return null;
  run?.abort();
  run = new AbortController();
  status = "submitted";
  return run;
}

export function setSessionRunStatus(next: SessionStatus) {
  status = next;
}

export function endSessionRun() {
  run = null;
  status = "idle";
}

export function stopSessionRun() {
  run?.abort();
}
