import type { UIMessage } from "ai";

import type { ChatEffort, HarnessId } from "./harness";

export type SessionClient = { id: string; label: string };

export type SessionSelection = {
  ref: string;
  name: string;
  by: string;
  byLabel: string;
  at: number;
} | null;

export type SessionDoc = {
  file: string | null;
  rev: number;
  selection: SessionSelection;
};

export type SessionThreadPrefs = {
  harness: HarnessId;
  model: string;
  effort: ChatEffort;
};

export type SessionStatus = "idle" | "submitted" | "streaming";

/** One active project per server. Shared by every paired client. */
export type ProjectSession = {
  project: { path: string };
  doc: SessionDoc;
  threadId: string | null;
  thread: SessionThreadPrefs;
  status: SessionStatus;
};

export type SessionSnapshot = ProjectSession & {
  messages: UIMessage[];
  you?: SessionClient;
};

export type SessionEvent =
  | { type: "snapshot"; session: SessionSnapshot }
  | { type: "doc"; doc: SessionDoc }
  | { type: "thread"; threadId: string; messages: UIMessage[]; status: SessionStatus }
  | { type: "prefs"; threadId: string; thread: SessionThreadPrefs };
