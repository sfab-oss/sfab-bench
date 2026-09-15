import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { jsonApi } from "@/lib/api";
import { useProjectSession } from "@/hooks/useProjectSession";
import {
  DEFAULT_CHAT_EFFORT,
  DEFAULT_HARNESS,
  DEFAULT_HARNESS_MODEL,
  isChatEffort,
  isHarnessId,
  type ChatEffort,
  type HarnessId,
} from "@/lib/harness";
import { store, useStore } from "@/state/store";
import { shouldPersistMessages } from "@/chat/persist-thread";

export type ThreadRow = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  harness?: string | null;
  model?: string | null;
  effort?: string | null;
};

type ViewerChatValue = {
  threads: ThreadRow[];
  threadId: string | null;
  initialMessages: GalleryChatMessage[];
  refreshThreads: () => Promise<ThreadRow[] | undefined>;
  newThread: () => Promise<void>;
  openThread: (id: string) => Promise<void>;
};

const ViewerChatContext = createContext<ViewerChatValue | null>(null);

function threadKey(path: string) {
  return `sfab-bench.thread:${path}`;
}

function readSavedThread(path: string) {
  if (!path) return null;
  try {
    return localStorage.getItem(threadKey(path));
  } catch {
    return null;
  }
}

function writeSavedThread(path: string, id: string | null) {
  if (!path) return;
  try {
    if (id) localStorage.setItem(threadKey(path), id);
    else localStorage.removeItem(threadKey(path));
  } catch {
    /* private mode */
  }
}

function applyThreadPrefs(row: { harness?: string | null; model?: string | null; effort?: string | null }) {
  const harness: HarnessId = row.harness && isHarnessId(row.harness) ? row.harness : DEFAULT_HARNESS;
  const model =
    typeof row.model === "string" && row.model.trim() ? row.model.trim() : DEFAULT_HARNESS_MODEL[harness];
  const effort: ChatEffort = row.effort && isChatEffort(row.effort) ? row.effort : DEFAULT_CHAT_EFFORT;
  store.getState().setChatSelection(harness, model);
  store.getState().setChatEffort(effort);
}

function persistOpenPrefs(id: string) {
  const s = store.getState();
  return jsonApi.threads[":id"].prefs.$put({
    param: { id },
    json: { harness: s.chatHarness, model: s.chatModel, effort: s.chatEffort },
  });
}

export function ViewerChatProvider({ children }: { children: ReactNode }) {
  const chatOpen = useStore((s) => s.chatOpen);
  const compactChatOpen = useStore((s) => s.compactChatOpen);
  const xrChatOpen = useStore((s) => s.xrChatOpen);
  const xrDock = useStore((s) => s.bringChat);
  const active = chatOpen || compactChatOpen || xrChatOpen || xrDock != null;
  const projectPath = useProjectSession().project.path;
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<GalleryChatMessage[]>([]);

  const refreshThreads = useCallback(async () => {
    if (!projectPath) return [];
    const res = await jsonApi.threads.$get();
    if (!res.ok) return;
    const rows = (await res.json()) as ThreadRow[];
    setThreads(rows);
    return rows;
  }, [projectPath]);

  const openThread = useCallback(
    async (id: string) => {
      if (!projectPath) return;
      const res = await jsonApi.threads[":id"].$get({ param: { id } });
      if (!res.ok) return;
      const body = (await res.json()) as { thread?: ThreadRow; messages?: GalleryChatMessage[] };
      setThreadId(id);
      setInitialMessages(body.messages ?? []);
      if (body.thread) applyThreadPrefs(body.thread);
      writeSavedThread(projectPath, id);
      await refreshThreads();
    },
    [projectPath, refreshThreads],
  );

  const newThread = useCallback(async () => {
    if (!projectPath) return;
    const res = await jsonApi.threads.$post();
    if (!res.ok) return;
    const row = (await res.json()) as ThreadRow;
    await persistOpenPrefs(row.id);
    setThreadId(row.id);
    setInitialMessages([]);
    writeSavedThread(projectPath, row.id);
    await refreshThreads();
  }, [projectPath, refreshThreads]);

  useEffect(() => {
    setThreadId(null);
    setInitialMessages([]);
    setThreads([]);
  }, [projectPath]);

  useEffect(() => {
    if (!active || !projectPath || threadId) return;
    let cancelled = false;
    void (async () => {
      const rows = (await refreshThreads()) ?? [];
      if (cancelled) return;
      const saved = readSavedThread(projectPath);
      if (saved && rows.some((row) => row.id === saved)) {
        await openThread(saved);
        return;
      }
      if (cancelled) return;
      if (rows[0]) {
        await openThread(rows[0].id);
        return;
      }
      await newThread();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, projectPath, threadId, refreshThreads, openThread, newThread]);

  useEffect(() => {
    if (!threadId) return;
    let prev = store.getState();
    return store.subscribe((next) => {
      const was = prev;
      prev = next;
      if (
        next.chatHarness === was.chatHarness &&
        next.chatModel === was.chatModel &&
        next.chatEffort === was.chatEffort
      ) {
        return;
      }
      void persistOpenPrefs(threadId);
    });
  }, [threadId]);

  const value = useMemo(
    () => ({
      threads,
      threadId,
      initialMessages,
      refreshThreads,
      newThread,
      openThread,
    }),
    [threads, threadId, initialMessages, refreshThreads, newThread, openThread],
  );

  return <ViewerChatContext.Provider value={value}>{children}</ViewerChatContext.Provider>;
}

export function useViewerChat() {
  const ctx = useContext(ViewerChatContext);
  if (!ctx) throw new Error("useViewerChat requires ViewerChatProvider");
  return ctx;
}

export function persistThread(threadId: string, messages: GalleryChatMessage[]) {
  if (!shouldPersistMessages(messages)) return Promise.resolve();
  return jsonApi.threads[":id"].$put({
    param: { id: threadId },
    json: { messages },
  });
}

export function messagePlainText(message: GalleryChatMessage) {
  return (message.parts ?? [])
    .flatMap((part) => (part.type === "text" && "text" in part ? [part.text] : []))
    .join("\n")
    .split("\n")
    .filter((line) => !line.startsWith("[viewer]"))
    .join("\n")
    .trim();
}
