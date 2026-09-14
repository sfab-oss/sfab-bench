import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";

import { jsonApi, getDeviceToken } from "@/lib/api";
import { applyingSession, beginApplyingSession, endApplyingSession, isApplyingSession } from "@/lib/session-apply";
import type {
  ProjectSession,
  SessionClient,
  SessionDoc,
  SessionEvent,
  SessionSnapshot,
  SessionStatus,
  SessionThreadPrefs,
} from "@/lib/session";
import {
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
} from "@/lib/harness";
import { modelUrl } from "@/cad/loadCadReview";
import { store } from "@/state/store";

type SessionValue = {
  ready: boolean;
  you: SessionClient;
  project: ProjectSession["project"];
  doc: SessionDoc;
  threadId: string | null;
  thread: SessionThreadPrefs;
  status: SessionStatus;
  messages: UIMessage[];
  setDoc: (file: string | null, reload?: boolean) => Promise<void>;
  setSelection: (ref: string | null, name?: string) => void;
  setThread: (id: string) => Promise<void>;
  newThread: () => Promise<void>;
  ensureThread: () => Promise<string | null>;
  setPrefs: (patch: Partial<SessionThreadPrefs>) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

const fallbackPrefs = (): SessionThreadPrefs => ({
  harness: DEFAULT_HARNESS,
  model: DEFAULT_HARNESS_MODEL[DEFAULT_HARNESS],
  effort: DEFAULT_CHAT_EFFORT,
});

function sessionWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getDeviceToken();
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/api/session/live${q}`;
}

function applyDoc(doc: SessionDoc, prev: SessionDoc) {
  beginApplyingSession();
  const finish = () => {
    store.getState().selectByRef(doc.selection?.ref ?? null);
    endApplyingSession();
  };
  const current = store.getState().url;
  const fileChanged = current !== (doc.file ?? "");
  const rebuilt = !fileChanged && prev.rev !== doc.rev && Boolean(doc.file);
  if (fileChanged || rebuilt) {
    void store.getState().loadModel(doc.file ?? "").then(finish, finish);
    return;
  }
  finish();
}

function applyPrefs(thread: SessionThreadPrefs) {
  applyingSession(() => {
    store.getState().setChatSelection(thread.harness, thread.model);
    store.getState().setChatEffort(thread.effort);
  });
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
  const [doc, setDocState] = useState<SessionDoc>({ file: null, rev: 0, selection: null });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThreadState] = useState<SessionThreadPrefs>(fallbackPrefs);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const appliedDeepLink = useRef(false);
  const lastDoc = useRef<SessionDoc>({ file: null, rev: -1, selection: null });

  const applySnapshot = useCallback((snap: SessionSnapshot) => {
    if (snap.you) setYou(snap.you);
    setProject(snap.project);
    setDocState(snap.doc);
    setThreadId(snap.threadId);
    setThreadState(snap.thread);
    setStatus(snap.status);
    setMessages(snap.messages);
    applyPrefs(snap.thread);
    if (!appliedDeepLink.current) {
      appliedDeepLink.current = true;
      const deep = modelUrl();
      if (deep && deep !== (snap.doc.file ?? "")) {
        void jsonApi.session.doc.$post({ json: { file: deep } });
        return;
      }
    }
    if (lastDoc.current.file !== snap.doc.file || lastDoc.current.rev !== snap.doc.rev) {
      const prev = lastDoc.current;
      lastDoc.current = snap.doc;
      applyDoc(snap.doc, prev);
    } else if ((lastDoc.current.selection?.ref ?? null) !== (snap.doc.selection?.ref ?? null)) {
      lastDoc.current = snap.doc;
      applyingSession(() => store.getState().selectByRef(snap.doc.selection?.ref ?? null));
    }
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
        if (event.type === "doc") {
          setDocState(event.doc);
          if (lastDoc.current.file !== event.doc.file || lastDoc.current.rev !== event.doc.rev) {
            const prev = lastDoc.current;
            lastDoc.current = event.doc;
            applyDoc(event.doc, prev);
          } else if ((lastDoc.current.selection?.ref ?? null) !== (event.doc.selection?.ref ?? null)) {
            lastDoc.current = event.doc;
            applyingSession(() => store.getState().selectByRef(event.doc.selection?.ref ?? null));
          }
          return;
        }
        if (event.type === "thread") {
          setThreadId(event.threadId || null);
          setStatus(event.status);
          setMessages(event.messages);
          return;
        }
        if (event.type === "prefs") {
          setThreadId(event.threadId || null);
          setThreadState(event.thread);
          applyPrefs(event.thread);
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
  }, [applySnapshot]);

  useEffect(() => {
    let prev = store.getState();
    return store.subscribe((next) => {
      const was = prev;
      prev = next;
      if (isApplyingSession()) return;
      if (next.pickedRef === was.pickedRef && next.selectedId === was.selectedId) return;
      const part = next.selectedId !== null ? next.review?.parts[next.selectedId] : undefined;
      const ref = next.pickedRef;
      void jsonApi.session.selection.$post({
        json: { ref, name: part?.name ?? undefined },
      });
    });
  }, []);

  const setDoc = useCallback(async (file: string | null, reload = false) => {
    await jsonApi.session.doc.$post({ json: { file, reload } });
  }, []);

  const setSelection = useCallback((ref: string | null, name?: string) => {
    void jsonApi.session.selection.$post({ json: { ref, name } });
  }, []);

  const setThread = useCallback(async (id: string) => {
    await jsonApi.session.thread.$post({ json: { id } });
  }, []);

  const newThread = useCallback(async () => {
    await jsonApi.session.thread.$post({ json: { create: true } });
  }, []);

  const ensureThread = useCallback(async () => {
    const res = await jsonApi.session.thread.$post({ json: {} });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  }, []);

  const setPrefs = useCallback((patch: Partial<SessionThreadPrefs>) => {
    void jsonApi.session.prefs.$post({ json: patch });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      you,
      project,
      doc,
      threadId,
      thread,
      status,
      messages,
      setDoc,
      setSelection,
      setThread,
      newThread,
      ensureThread,
      setPrefs,
    }),
    [
      ready,
      you,
      project,
      doc,
      threadId,
      thread,
      status,
      messages,
      setDoc,
      setSelection,
      setThread,
      newThread,
      ensureThread,
      setPrefs,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useProjectSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useProjectSession requires ProjectSessionProvider");
  return ctx;
}
