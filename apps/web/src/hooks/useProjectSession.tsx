import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { jsonApi, getDeviceToken } from "@/lib/api";
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
  const [project, setProject] = useState<ProjectSession["project"]>({ path: "" });
  const [fileRecents, setFileRecents] = useState<string[]>([]);
  const appliedDeepLink = useRef(false);
  const lastPath = useRef("");

  const applyLibrary = useCallback((path: string, recents: string[]) => {
    const pathChanged = lastPath.current !== path;
    if (lastPath.current && pathChanged) {
      void store.getState().loadModel("");
    }
    lastPath.current = path;
    setProject({ path });
    setFileRecents(recents);
    store.getState().setRecentFiles(recents);
    if (pathChanged) window.dispatchEvent(new Event("sfab-project"));
  }, []);

  const applySnapshot = useCallback(
    (snap: SessionSnapshot) => {
      if (snap.you) setYou(snap.you);
      applyLibrary(snap.project.path, snap.fileRecents ?? []);
      if (!appliedDeepLink.current) {
        appliedDeepLink.current = true;
        const deep = modelUrl();
        if (deep) void store.getState().loadModel(deep);
      }
    },
    [applyLibrary],
  );

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
          applyLibrary(event.project.path, event.fileRecents);
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
  }, [applySnapshot, applyLibrary]);

  const setDoc = useCallback(async (file: string | null, _reload = false) => {
    await store.getState().loadModel(file ?? "");
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
