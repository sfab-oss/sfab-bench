import type { ChatEffort, HarnessId } from "./harness";

export type SessionClient = { id: string; label: string };

export type SessionThreadPrefs = {
  harness: HarnessId;
  model: string;
  effort: ChatEffort;
};

export type SessionStatus = "idle" | "submitted" | "streaming";

/**
 * Shared library for every paired client of this process.
 * Viewport (open file, selection, camera, active thread, live stream) stays
 * per browser. See ADR 0003.
 */
export type ProjectSession = {
  project: { path: string };
  fileRecents: string[];
};

export type SessionSnapshot = ProjectSession & {
  you?: SessionClient;
};

export type SessionEvent =
  | { type: "snapshot"; session: SessionSnapshot }
  | { type: "library"; project: { path: string }; fileRecents: string[]; revision: number };
