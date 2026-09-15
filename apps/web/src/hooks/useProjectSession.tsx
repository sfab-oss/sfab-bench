import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { closeToast, showToast } from "@/components/ui/toast";
import { jsonApi, getDeviceToken } from "@/lib/api";
import {
  CONNECTION_RETRY_MS,
  INITIAL_CONNECTION_STATE,
  reduceConnection,
  type ConnectionEvent,
  type ConnectionPhase,
  type ConnectionState,
} from "@/lib/feedback";
import { shouldReloadOpenFile } from "@/lib/files-rail";
import { registerAndOpenTab } from "@/lib/project";
import { projectUrl } from "@/lib/project-query";
import { redact } from "@/lib/redact";
import type { ProjectSession, SessionClient, SessionEvent, SessionSnapshot } from "@/lib/session";
import { emitFolderError } from "@/lib/welcome";
import { modelUrl } from "@/cad/loadCadReview";
import { store } from "@/state/store";

type SessionValue = {
  ready: boolean;
  you: SessionClient;
  project: ProjectSession["project"];
  fileRecents: string[];
  connectionPhase: ConnectionPhase;
  connectionOfferReload: boolean;
  setDoc: (file: string | null, reload?: boolean) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function sessionWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getDeviceToken();
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/api/session/live${q}`;
}

export function ProjectSessionProvider({
  you: youProp,
  children,
}: {
  you: SessionClient;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [you, setYou] = useState(youProp);
  const [project, setProject] = useState<ProjectSession["project"]>(() => ({ path: projectUrl() }));
  const [fileRecents, setFileRecents] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState>(INITIAL_CONNECTION_STATE);
  const appliedDeepLink = useRef(false);
  const lastPath = useRef(projectUrl());

  const applyLibrary = useCallback((path: string, recents: string[]) => {
    const pathChanged = lastPath.current !== path;
    if (pathChanged) {
      const { url, error, progress } = store.getState();
      // Clear a leftover ?file=-only boot, or the previous folder's document.
      if (lastPath.current || url || error || progress !== null) {
        void store.getState().loadModel("");
      }
    }
    lastPath.current = path;
    setProject({ path });
    setFileRecents(recents);
    store.getState().setRecentFiles(recents);
  }, []);

  const adoptTab = useCallback(
    (path: string, recents: string[]) => {
      applyLibrary(path, recents);
      if (!path) {
        if (modelUrl() || store.getState().url || store.getState().progress !== null) {
          void store.getState().loadModel("");
        }
        return;
      }
      if (!appliedDeepLink.current) {
        appliedDeepLink.current = true;
        const deep = modelUrl();
        if (deep) void store.getState().loadModel(deep);
      }
    },
    [applyLibrary],
  );

  const loadTabLibrary = useCallback((path: string) => {
    if (!path) {
      adoptTab("", []);
      return;
    }
    void jsonApi.project
      .$get()
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load project");
        return res.json() as Promise<{ fileRecents?: string[] }>;
      })
      .then((body) => {
        if (projectUrl() !== path) return;
        adoptTab(path, body.fileRecents ?? []);
      })
      .catch(() => {
        if (projectUrl() === path) adoptTab(path, []);
      });
  }, [adoptTab]);

  const applySnapshot = useCallback(
    (snap: SessionSnapshot) => {
      if (snap.you) setYou(snap.you);
      const tab = projectUrl();
      if (!tab) {
        adoptTab("", []);
        return;
      }
      if (tab === snap.project.path) {
        adoptTab(tab, snap.fileRecents ?? []);
        return;
      }
      loadTabLibrary(tab);
    },
    [adoptTab, loadTabLibrary],
  );

  useEffect(() => {
    const onUrl = () => {
      const path = projectUrl();
      if (path === lastPath.current) return;
      loadTabLibrary(path);
    };
    window.addEventListener("sfab-project", onUrl);
    window.addEventListener("popstate", onUrl);
    return () => {
      window.removeEventListener("sfab-project", onUrl);
      window.removeEventListener("popstate", onUrl);
    };
  }, [loadTabLibrary]);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const path = (ev as CustomEvent<string>).detail;
      if (typeof path !== "string" || !path.trim()) return;
      void registerAndOpenTab(path)
        .then(() => {
          emitFolderError(null);
        })
        .catch((err: unknown) => {
          emitFolderError(redact(err instanceof Error ? err.message : "Could not open that folder"));
        });
    };
    window.addEventListener("sfab-open-folder", onOpen);
    return () => window.removeEventListener("sfab-open-folder", onOpen);
  }, []);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let current = INITIAL_CONNECTION_STATE;

    const applyConnection = (event: ConnectionEvent) => {
      const { state, notice } = reduceConnection(current, event);
      current = state;
      setConnection(state);
      if (notice === "lost") {
        showToast({
          id: "connection-lost",
          type: "info",
          title: "Lost connection to this Mac — reconnecting…",
        });
      } else if (notice === "reconnected") {
        closeToast("connection-lost");
        closeToast("connection-offline");
        showToast({ type: "success", title: "Reconnected" });
      } else if (notice === "reload") {
        closeToast("connection-lost");
        showToast({
          id: "connection-offline",
          type: "error",
          title: "Lost connection to this Mac",
          description: "This page can't reach the workbench process.",
          action: { label: "Reload", onClick: () => window.location.reload() },
        });
      }
    };

    const connect = () => {
      ws = new WebSocket(sessionWsUrl());
      ws.onmessage = (ev) => {
        if (closed) return;
        let event: SessionEvent;
        try {
          event = JSON.parse(String(ev.data)) as SessionEvent;
        } catch {
          return;
        }
        if (event.type === "snapshot") {
          applySnapshot(event.session);
          setReady(true);
          applyConnection({ type: "snapshot", now: Date.now() });
          return;
        }
        if (event.type === "library") {
          if (event.project.path === projectUrl()) {
            adoptTab(event.project.path, event.fileRecents);
          }
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setReady(false);
        applyConnection({ type: "close", now: Date.now() });
        retry = setTimeout(connect, CONNECTION_RETRY_MS);
      };
    };

    connect();
    const tick = window.setInterval(() => {
      if (closed || current.phase === "connected") return;
      applyConnection({ type: "tick", now: Date.now() });
    }, 1_000);
    return () => {
      closed = true;
      window.clearInterval(tick);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [applySnapshot, adoptTab]);

  const setDoc = useCallback(async (file: string | null, reload = false) => {
    const { url, error, loadModel } = store.getState();
    const next = file ?? "";
    if (!reload && next && !shouldReloadOpenFile(next, url, Boolean(error))) return;
    await loadModel(next);
    if (file) {
      void jsonApi.recents.$post({ json: { path: file } });
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      you,
      project,
      fileRecents,
      connectionPhase: connection.phase,
      connectionOfferReload: connection.offerReload,
      setDoc,
    }),
    [ready, you, project, fileRecents, connection.phase, connection.offerReload, setDoc],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useProjectSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useProjectSession requires ProjectSessionProvider");
  return ctx;
}
