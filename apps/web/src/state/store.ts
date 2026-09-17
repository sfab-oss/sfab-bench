import type { Group, Object3D, Vector3 } from "three";
import { useStore as useZustandStore } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { applyHighlights, clearHighlights } from "@/cad/highlights";
import {
  fileLabel,
  loadCadReview,
  modelUrl,
  syncFileQuery,
} from "@/cad/loadCadReview";
import { type CadReview, isAncestor } from "@/cad/review";
import { type Appearance, readDomAppearance } from "@/lib/appearance";
import {
  type ChatEffort,
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
  type HarnessId,
  isChatEffort,
  isHarnessId,
} from "@/lib/harness";
import { CHAT_DEFAULT_WIDTH, clampStoredChatWidth } from "@/lib/layout";
import { projectUrl } from "@/lib/project-query";
import { invalidateSceneNow } from "@/scene/invalidate";

export {
  CHAT_DEFAULT_WIDTH,
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
} from "@/lib/layout";

const DESKTOP_PREFS_KEY = "sfab-bench.desktop";
const MAX_RECENTS = 12;
const PREF_WRITE_MS = 250;

/** Skip identical prefs JSON and keep localStorage off the XR frame. */
function deferredPrefStorage(): StateStorage {
  let last = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => {
      const value = localStorage.getItem(name);
      if (value != null) last = value;
      return value;
    },
    setItem: (name, value) => {
      if (value === last) return;
      last = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        localStorage.setItem(name, value);
      }, PREF_WRITE_MS);
    },
    removeItem: (name) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = "";
      localStorage.removeItem(name);
    },
  };
}

export const DEFAULT_CHAT_MODEL = DEFAULT_HARNESS_MODEL.opencode;

type DesktopPrefs = {
  chatOpen: boolean;
  treeOpen: boolean;
  partsOpen: boolean;
  axesVisible: boolean;
  chatWidth: number;
  chatHarness: HarnessId;
  chatModel: string;
  chatEffort: ChatEffort;
};

function clampChatWidth(n: number) {
  return clampStoredChatWidth(n);
}

function readDesktopPrefs(): Partial<DesktopPrefs> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(DESKTOP_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: Partial<DesktopPrefs> };
    return parsed.state ?? {};
  } catch {
    return {};
  }
}

const prefs = readDesktopPrefs();

export type Tool = "select" | "measure" | "hide";
export type MeasurePoint = { cadRef: string; point: [number, number, number] };
export type Page = "tree" | "settings" | "help";
/** Where the left-hand card lives: on the wrist, or anchored in the world. */
export type CardMode = "wrist" | "world";
export type XrSwitchTo = "ar" | "vr" | null;
type Setter = boolean | ((open: boolean) => boolean);

/**
 * Hover never lives in the store: it changes on every pointer move and only
 * drives material tints, so keeping it here avoids a render per frame.
 */
let hoveredId: number | null = null;
/**
 * Stream char count never lives in the store: it changes every token and
 * only drives the orb pulse in `useFrame`. Persist wraps every `set()`.
 */
let xrChatChars = 0;
export function getXrChatChars() {
  return xrChatChars;
}
export function setXrChatChars(n: number) {
  xrChatChars = n;
}
/** Guards against a stale `loadModel` resolving after a newer one started. */
let loadToken = 0;

const apply = (state: Pick<State, "review" | "selectedId">) => {
  if (state.review) applyHighlights(state.review, state.selectedId, hoveredId);
};

const resolve = (cur: boolean, next: Setter) =>
  typeof next === "function" ? next(cur) : next;

type State = {
  // viewer
  url: string;
  title: string;
  review: CadReview | null;
  progress: number | null;
  error: string | null;
  selectedId: number | null;
  pickedRef: string | null;
  treeOpen: boolean;
  partsOpen: boolean;
  chatOpen: boolean;
  /** Compact-sheet open state. Not persisted — must not rewrite `chatOpen`. */
  compactChatOpen: boolean;
  chatWidth: number;
  chatHarness: HarnessId;
  chatModel: string;
  chatEffort: ChatEffort;
  recentFiles: string[];
  axesVisible: boolean;
  /** Source of truth for part visibility; the scene is updated from it. */
  hiddenIds: Set<number>;
  tool: Tool;
  measure: { a: MeasurePoint | null; b: MeasurePoint | null };
  loadModel: (url: string) => Promise<void>;
  setRecentFiles: (paths: string[]) => void;
  setTreeOpen: (open: Setter) => void;
  setPartsOpen: (open: Setter) => void;
  setChatOpen: (open: Setter) => void;
  setCompactChatOpen: (open: Setter) => void;
  setChatWidth: (width: number) => void;
  /** True once the user has orbited; blocks the one-shot settled auto-fit. */
  cameraMoved: boolean;
  setCameraMoved: (moved: boolean) => void;
  setChatHarness: (harness: HarnessId) => void;
  setChatModel: (model: string) => void;
  setChatSelection: (harness: HarnessId, model: string) => void;
  setChatEffort: (effort: ChatEffort) => void;
  setAxesVisible: (open: Setter) => void;
  select: (id: number | null, cadRef?: string) => void;
  selectByRef: (ref: string | null) => void;
  /**
   * Click-on-model selection: a first click selects the leaf; clicking a part
   * whose selection already covers it walks up one assembly, and from the
   * top-level assembly cycles back to the leaf.
   */
  selectFromModel: (leafId: number, cadRef?: string) => void;
  hover: (id: number | null) => void;
  setVisible: (id: number, visible: boolean) => void;
  isolate: (id: number) => void;
  showAll: () => void;
  setTool: (tool: Tool) => void;
  measureClick: (point: MeasurePoint) => void;
  /** Removes the most recent measure point. */
  undoMeasure: () => void;
  clearMeasure: () => void;

  // xr ui
  page: Page;
  cardOpen: boolean;
  cardMode: CardMode;
  xrChatOpen: boolean;
  xrChatPhase: "idle" | "submitted" | "streaming";
  toolsOpen: boolean;
  appearance: Appearance;
  setPage: (page: Page) => void;
  setCardOpen: (open: Setter) => void;
  setCardMode: (mode: CardMode) => void;
  setXrChatOpen: (open: Setter) => void;
  setXrChatPhase: (phase: "idle" | "submitted" | "streaming") => void;
  /** Places the card in front of the wearer; used by the pin button. */
  bringCard: (() => void) | null;
  setBringCard: (fn: (() => void) | null) => void;
  bringChat: (() => void) | null;
  setBringChat: (fn: (() => void) | null) => void;
  /** True while the tree-card handle is being dragged. */
  cardDragging: boolean;
  setCardDragging: (on: boolean) => void;
  setToolsOpen: (open: Setter) => void;
  setAppearance: (appearance: Appearance) => void;

  // hands
  left: boolean;
  right: boolean;
  leftHold: boolean;
  rightHold: boolean;
  worldGrabbing: boolean;
  setHandGrab: (side: "left" | "right", on: boolean) => void;
  setHandHold: (side: "left" | "right", on: boolean) => void;
  setWorldGrabbing: (on: boolean) => void;

  // xr switch overlay
  switching: XrSwitchTo;
  setXrSwitch: (next: XrSwitchTo) => void;

  /** Canvas island crash; Overlay paints the card so chat and the rail stay up. */
  sceneCrash: { error: unknown; reset: () => void } | null;
  setSceneCrash: (next: { error: unknown; reset: () => void } | null) => void;

  // scene
  placed: Group | null;
  fit: ((obj: Object3D, dir?: Vector3) => void) | null;
  setPlaced: (group: Group | null) => void;
  setFit: (fit: ((obj: Object3D, dir?: Vector3) => void) | null) => void;
  bumpScale: (factor: number) => void;
  resetScale: () => void;
  /** Uniform scale of `placed`, mirrored here so UI can show it. */
  modelScale: number;
  setModelScale: (scale: number) => void;
  /** Re-places the model in front of the wearer at 1:1; registered by the scene. */
  recenter: (() => void) | null;
  setRecenter: (fn: (() => void) | null) => void;
};

const url = projectUrl() ? modelUrl() : "";

export const store = createStore<State>()(
  persist(
    (set, get) => ({
      url,
      title: fileLabel(url),
      review: null,
      progress: url ? 0 : null,
      error: null,
      selectedId: null,
      pickedRef: null,
      treeOpen: prefs.treeOpen ?? true,
      partsOpen: prefs.partsOpen ?? true,
      chatOpen: prefs.chatOpen ?? true,
      compactChatOpen: false,
      cameraMoved: false,
      chatWidth:
        prefs.chatWidth != null
          ? clampChatWidth(prefs.chatWidth)
          : CHAT_DEFAULT_WIDTH,
      chatHarness: isHarnessId(prefs.chatHarness ?? "")
        ? prefs.chatHarness!
        : DEFAULT_HARNESS,
      chatModel:
        typeof prefs.chatModel === "string" && prefs.chatModel.trim()
          ? prefs.chatModel.trim()
          : DEFAULT_HARNESS_MODEL[
              isHarnessId(prefs.chatHarness ?? "")
                ? prefs.chatHarness!
                : DEFAULT_HARNESS
            ],
      chatEffort: isChatEffort(prefs.chatEffort ?? "")
        ? prefs.chatEffort!
        : DEFAULT_CHAT_EFFORT,
      recentFiles: [],
      axesVisible: prefs.axesVisible ?? true,
      hiddenIds: new Set<number>(),
      tool: "select",
      measure: { a: null, b: null },

      loadModel: async (next) => {
        const token = ++loadToken;
        clearHighlights();
        syncFileQuery(next);
        if (!next) {
          set({
            url: "",
            title: fileLabel(""),
            progress: null,
            error: null,
            review: null,
            selectedId: null,
            pickedRef: null,
            hiddenIds: new Set(),
            tool: "select",
            measure: { a: null, b: null },
            cameraMoved: false,
          });
          return;
        }
        set({
          url: next,
          title: fileLabel(next),
          progress: 0,
          error: null,
          review: null,
          selectedId: null,
          pickedRef: null,
          hiddenIds: new Set(),
          tool: "select",
          measure: { a: null, b: null },
          cameraMoved: false,
        });
        try {
          const review = await loadCadReview(next, (loaded, total) => {
            if (token === loadToken && total) {
              set({
                progress: Math.min(100, Math.round((loaded / total) * 100)),
              });
            }
          });
          if (token !== loadToken) return;
          const recents = [
            next,
            ...get().recentFiles.filter((p) => p !== next),
          ].slice(0, MAX_RECENTS);
          set({
            review,
            progress: null,
            hiddenIds: new Set<number>(),
            recentFiles: recents,
          });
          apply(get());
        } catch (err: unknown) {
          if (token !== loadToken) return;
          set({
            error: err instanceof Error ? err.message : String(err),
            progress: null,
          });
        }
      },
      setRecentFiles: (paths) => {
        const recentFiles = paths
          .filter((p): p is string => typeof p === "string" && p.length > 0)
          .slice(0, MAX_RECENTS);
        const cur = get().recentFiles;
        if (
          cur.length === recentFiles.length &&
          cur.every((p, i) => p === recentFiles[i])
        )
          return;
        set({ recentFiles });
      },
      setTreeOpen: (open) =>
        set((s) => ({ treeOpen: resolve(s.treeOpen, open) })),
      setPartsOpen: (open) =>
        set((s) => ({ partsOpen: resolve(s.partsOpen, open) })),
      setChatOpen: (open) =>
        set((s) => ({ chatOpen: resolve(s.chatOpen, open) })),
      setCompactChatOpen: (open) =>
        set((s) => ({ compactChatOpen: resolve(s.compactChatOpen, open) })),
      setCameraMoved: (moved) => {
        if (get().cameraMoved !== moved) set({ cameraMoved: moved });
      },
      setChatWidth: (width) => {
        const chatWidth = clampChatWidth(width);
        if (get().chatWidth !== chatWidth) set({ chatWidth });
      },
      setChatHarness: (harness) => {
        if (get().chatHarness === harness) return;
        set({
          chatHarness: harness,
          chatModel: DEFAULT_HARNESS_MODEL[harness],
        });
      },
      setChatModel: (model) => {
        const chatModel = model.trim();
        if (chatModel && get().chatModel !== chatModel) set({ chatModel });
      },
      setChatSelection: (harness, model) => {
        const chatModel = model.trim() || DEFAULT_HARNESS_MODEL[harness];
        const cur = get();
        if (cur.chatHarness === harness && cur.chatModel === chatModel) return;
        set({ chatHarness: harness, chatModel });
      },
      setChatEffort: (effort) => {
        if (get().chatEffort !== effort) set({ chatEffort: effort });
      },
      setAxesVisible: (open) =>
        set((s) => ({ axesVisible: resolve(s.axesVisible, open) })),
      select: (id, cadRef) => {
        const { review } = get();
        if (id === null) {
          set({ selectedId: null, pickedRef: null });
        } else {
          set({
            selectedId: id,
            pickedRef:
              cadRef ??
              review?.parts[id]?.cadRef ??
              review?.parts[id]?.name ??
              null,
          });
        }
        apply(get());
      },
      selectByRef: (ref) => {
        if (!ref) {
          get().select(null);
          return;
        }
        const { review } = get();
        /**
         * Refs come back in the form they went out in, and what goes out is a *face*
         * ref: picking yields `#o1.1.f6`, and `viewerSnapshot` reports that rather than
         * the part. Parts answer to `#o1.1`, so matching the whole string found nothing
         * for every ref the viewer has ever produced — the panel showed the ref while
         * the model highlighted nothing.
         *
         * Selection is per part; the face is kept as the ref, because that is what the
         * detail panel shows and what goes back out to the assistant next time.
         */
        const partRef = ref.replace(/\.f\d+$/, "");
        const part = review?.parts.find((p) => p.cadRef === partRef);
        if (part) get().select(part.id, ref);
        else set({ selectedId: null, pickedRef: ref });
      },
      selectFromModel: (leafId, cadRef) => {
        const { review, selectedId, select } = get();
        const leaf = review?.parts[leafId]?.object;
        const sel =
          selectedId !== null ? review?.parts[selectedId]?.object : undefined;
        if (
          !review ||
          !leaf ||
          !sel ||
          (sel !== leaf && !isAncestor(sel, leaf))
        ) {
          select(leafId, cadRef);
          return;
        }
        let p = sel.parent;
        while (p && p !== review.root) {
          const part = review.partByObject.get(p);
          if (part) {
            select(part.id);
            return;
          }
          p = p.parent;
        }
        select(leafId, cadRef);
      },
      hover: (id) => {
        if (hoveredId === id) return;
        hoveredId = id;
        apply(get());
        invalidateSceneNow();
      },
      setVisible: (id, visible) => {
        const { review, hiddenIds } = get();
        review?.setPartVisible(id, visible);
        const next = new Set(hiddenIds);
        if (visible) next.delete(id);
        else next.add(id);
        set({ hiddenIds: next });
      },
      isolate: (id) => {
        const { review } = get();
        if (!review) return;
        review.isolate(id);
        set({
          selectedId: id,
          pickedRef: review.parts[id]?.cadRef ?? review.parts[id]?.name ?? null,
          hiddenIds: new Set(
            review.parts
              .filter((part) => !part.object.visible)
              .map((part) => part.id)
          ),
        });
        apply(get());
      },
      showAll: () => {
        const { review } = get();
        if (!review) return;
        review.showAll();
        set({ hiddenIds: new Set<number>() });
      },
      setTool: (tool) =>
        set((s) => ({
          tool,
          measure: tool === "measure" ? s.measure : { a: null, b: null },
        })),
      measureClick: (point) =>
        set((s) => ({
          measure:
            !s.measure.a || s.measure.b
              ? { a: point, b: null }
              : { a: s.measure.a, b: point },
        })),
      undoMeasure: () =>
        set((s) => ({
          measure: s.measure.b
            ? { a: s.measure.a, b: null }
            : { a: null, b: null },
        })),
      clearMeasure: () => set({ measure: { a: null, b: null } }),

      page: "tree",
      cardOpen: true,
      cardMode: "world",
      xrChatOpen: false,
      xrChatPhase: "idle",
      toolsOpen: false,
      appearance: readDomAppearance(),
      setPage: (page) => set({ page }),
      setCardOpen: (open) =>
        set((s) => ({ cardOpen: resolve(s.cardOpen, open) })),
      setCardMode: (cardMode) => set({ cardMode }),
      setXrChatOpen: (open) =>
        set((s) => ({ xrChatOpen: resolve(s.xrChatOpen, open) })),
      setXrChatPhase: (phase) => {
        if (get().xrChatPhase !== phase) set({ xrChatPhase: phase });
      },
      bringCard: null,
      setBringCard: (bringCard) => set({ bringCard }),
      bringChat: null,
      setBringChat: (bringChat) => set({ bringChat }),
      cardDragging: false,
      setCardDragging: (on) => {
        if (get().cardDragging !== on) set({ cardDragging: on });
      },
      setToolsOpen: (open) =>
        set((s) => ({ toolsOpen: resolve(s.toolsOpen, open) })),
      setAppearance: (appearance) => {
        if (get().appearance !== appearance) set({ appearance });
      },

      left: false,
      right: false,
      leftHold: false,
      rightHold: false,
      worldGrabbing: false,
      // XRGrab calls these every frame; skip unchanged values so listeners stay quiet.
      setHandGrab: (side, on) => {
        const key = side === "left" ? "left" : "right";
        if (get()[key] !== on) set({ [key]: on });
      },
      setHandHold: (side, on) => {
        const key = side === "left" ? "leftHold" : "rightHold";
        if (get()[key] !== on) set({ [key]: on });
      },
      setWorldGrabbing: (on) => {
        if (get().worldGrabbing !== on) set({ worldGrabbing: on });
      },

      switching: null,
      setXrSwitch: (switching) => set({ switching }),

      sceneCrash: null,
      setSceneCrash: (sceneCrash) => set({ sceneCrash }),

      placed: null,
      fit: null,
      setPlaced: (placed) => set({ placed }),
      setFit: (fit) => set({ fit }),
      bumpScale: (factor) => {
        const g = get().placed;
        if (!g) return;
        const next = Math.max(0.15, Math.min(8, g.scale.x * factor));
        g.scale.setScalar(next);
        set({ modelScale: next });
      },
      resetScale: () => {
        get().placed?.scale.setScalar(1);
        set({ modelScale: 1 });
      },
      modelScale: 1,
      setModelScale: (scale) => {
        if (get().modelScale !== scale) set({ modelScale: scale });
      },
      recenter: null,
      setRecenter: (recenter) => set({ recenter }),
    }),
    {
      name: DESKTOP_PREFS_KEY,
      storage: createJSONStorage(() => {
        if (typeof localStorage === "undefined") {
          throw new Error("localStorage unavailable");
        }
        return deferredPrefStorage();
      }),
      partialize: (s): DesktopPrefs => ({
        chatOpen: s.chatOpen,
        treeOpen: s.treeOpen,
        partsOpen: s.partsOpen,
        axesVisible: s.axesVisible,
        chatWidth: s.chatWidth,
        chatHarness: s.chatHarness,
        chatModel: s.chatModel,
        chatEffort: s.chatEffort,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<State> | undefined;
        if (!stored) return current;
        const { recentFiles: _ignored, ...rest } = stored;
        return { ...current, ...rest, recentFiles: current.recentFiles };
      },
    }
  )
);

/** Always call with a selector: the whole state changes on every hand frame. */
export function useStore<T>(selector: (state: State) => T): T {
  return useZustandStore(store, selector);
}
