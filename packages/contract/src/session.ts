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
 *
 * `project.path` is the process fallback used when a request omits `?project=`.
 * A tab's folder is that query parameter; see ADR 0006.
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
  /** `revision` is the catalog revision of the project this event names. */
  | {
      type: "library";
      project: { path: string };
      fileRecents: string[];
      revision: number;
    };
