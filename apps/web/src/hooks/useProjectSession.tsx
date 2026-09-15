import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { jsonApi, getDeviceToken } from "@/lib/api";
import { shouldReloadOpenFile } from "@/lib/files-rail";
import { registerAndOpenTab } from "@/lib/project";
import { projectUrl } from "@/lib/project-query";
import type { ProjectSession, SessionClient, SessionEvent, SessionSnapshot } from "@/lib/session";
import { modelUrl } from "@/cad/loadCadReview";
import { store } from "@/state/store";

type SessionValue = {
  ready: boolean;
  you: SessionClient;
  project: ProjectSession["project"];
  fileRecents: string[];
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
  const appliedDeepLink = useRef(false);
  const lastPath = useRef(projectUrl());

  const applyLibrary = useCallback((path: string, recents: string[]) => {
    const pathChanged = lastPath.current !== path;
    if (lastPath.current && pathChanged) {
      void store.getState().loadModel("");
    }
    lastPath.current = path;
    setProject({ path });
    setFileRecents(recents);
    store.getState().setRecentFiles(recents);
  }, []);

  const adoptTab = useCallback(
    (path: string, recents: string[]) => {
      applyLibrary(path, recents);
      if (!appliedDeepLink.current) {
        appliedDeepLink.current = true;
        const deep = modelUrl();
        if (deep && path) void store.getState().loadModel(deep);
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
      if (typeof path === "string" && path.trim()) void registerAndOpenTab(path);
    };
    window.addEventListener("sfab-open-folder", onOpen);
    return () => window.removeEventListener("sfab-open-folder", onOpen);
  }, []);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

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
        retry = setTimeout(connect, 1000);
      };
    };

    connect();
    return () => {
      closed = true;
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
      setDoc,
    }),
    [ready, you, project, fileRecents, setDoc],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useProjectSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useProjectSession requires ProjectSessionProvider");
  return ctx;
}
