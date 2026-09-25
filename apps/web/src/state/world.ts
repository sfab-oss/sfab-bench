import type {
  WorldBoardState,
  WorldError,
  WorldSender,
  WorldState,
} from "@sfab-bench/contract";
import { useStore as useZustandStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { readOpenDocument } from "@/lib/document-query";
import { projectUrl } from "@/lib/project-query";
import type { AssetIssue } from "@/lib/world-issues";

/**
 * The open world document and the low-rate HUD. Poses live in
 * `worldLiveState`, not here: a 30 Hz state must not render React.
 */
export type WorldConnection = "idle" | "connecting" | "live" | "reconnecting";

export type WorldHudState = {
  path: string;
  /** Bumped on an explicit reopen so a failed load can be retried. */
  loadId: number;
  /** Bumped when the server says the document changed on disk. */
  revision: number;
  playing: boolean;
  simTime: number;
  boards: Record<string, WorldBoardState>;
  connection: WorldConnection;
  /** Short "Paused by …" line. The attach snapshot does not set this. */
  notice: string | null;
  runErrors: WorldError[];
  runMessage: string | null;
  assetIssues: AssetIssue[];
  /** True once a scene has been built. A later error keeps that scene. */
  sceneReady: boolean;
  assets: "idle" | "loading" | "ready" | "error";
  open: (path: string, opts?: { force?: boolean }) => void;
  close: () => void;
  noteReload: () => void;
  setConnection: (connection: WorldConnection) => void;
  setRun: (playing: boolean, simTime: number) => void;
  setBoards: (boards: Record<string, WorldBoardState>) => void;
  setRunProblem: (errors: WorldError[], message?: string | null) => void;
  clearRunProblem: () => void;
  setNotice: (notice: string | null) => void;
  setAssetIssues: (issues: AssetIssue[]) => void;
  setAssets: (assets: WorldHudState["assets"], sceneReady?: boolean) => void;
};

function initialPath(): string {
  if (typeof window === "undefined" || !projectUrl()) return "";
  const doc = readOpenDocument(window.location.search);
  return doc.kind === "world" ? doc.path : "";
}

const path = initialPath();

/** Latest physics snapshot. The frame loop reads this. */
let live: WorldState | null = null;

export function worldLiveState(): WorldState | null {
  return live;
}

export function setWorldLiveState(state: WorldState | null) {
  live = state;
}

export const worldStore = createStore<WorldHudState>()((set, get) => ({
  path,
  loadId: 0,
  revision: 0,
  playing: false,
  simTime: 0,
  boards: {},
  connection: path ? "connecting" : "idle",
  notice: null,
  runErrors: [],
  runMessage: null,
  assetIssues: [],
  sceneReady: false,
  assets: path ? "loading" : "idle",

  open: (next, opts) => {
    const current = get();
    if (
      !opts?.force &&
      current.path === next &&
      current.connection !== "idle"
    ) {
      return;
    }
    live = null;
    set({
      path: next,
      loadId: current.loadId + 1,
      playing: false,
      simTime: 0,
      boards: {},
      connection: "connecting",
      notice: null,
      runErrors: [],
      runMessage: null,
      assetIssues: [],
      sceneReady: false,
      assets: "loading",
    });
  },
  close: () => {
    if (!get().path && get().connection === "idle") return;
    live = null;
    set({
      path: "",
      playing: false,
      simTime: 0,
      boards: {},
      connection: "idle",
      notice: null,
      runErrors: [],
      runMessage: null,
      assetIssues: [],
      sceneReady: false,
      assets: "idle",
    });
  },
  noteReload: () => set((s) => ({ revision: s.revision + 1 })),
  setConnection: (connection) => {
    if (get().connection !== connection) set({ connection });
  },
  setRun: (playing, simTime) => {
    const current = get();
    if (
      current.playing === playing &&
      current.simTime === simTime &&
      current.connection === "live"
    ) {
      return;
    }
    set({ playing, simTime, connection: "live" });
  },
  setBoards: (boards) => {
    const current = get().boards;
    const keys = Object.keys(boards);
    const prev = Object.keys(current);
    if (
      keys.length === prev.length &&
      keys.every((key) => {
        const next = boards[key];
        const old = current[key];
        return (
          next !== undefined &&
          old !== undefined &&
          next.running === old.running &&
          next.fault === old.fault
        );
      })
    ) {
      return;
    }
    set({ boards });
  },
  setRunProblem: (errors, message) =>
    set({
      runErrors: errors,
      runMessage: message?.trim() ? message : null,
      playing: false,
      connection: "live",
    }),
  clearRunProblem: () => {
    const current = get();
    if (current.runErrors.length === 0 && !current.runMessage) return;
    set({ runErrors: [], runMessage: null });
  },
  setNotice: (notice) => {
    if (get().notice !== notice) set({ notice });
  },
  setAssetIssues: (assetIssues) => {
    const current = get().assetIssues;
    if (
      current.length === assetIssues.length &&
      current.every(
        (issue, index) =>
          issue.text === assetIssues[index]?.text &&
          issue.mesh === assetIssues[index]?.mesh
      )
    ) {
      return;
    }
    set({ assetIssues });
  },
  setAssets: (assets, sceneReady) =>
    set((s) => ({
      assets,
      sceneReady: sceneReady ?? s.sceneReady,
    })),
}));

export function useWorld<T>(selector: (state: WorldHudState) => T): T {
  return useZustandStore(worldStore, selector);
}

export type { WorldSender };
