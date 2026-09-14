import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { jsonApi } from "@/lib/api";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";

export type ThreadRow = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
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

export function ViewerChatProvider({ children }: { children: ReactNode }) {
  const chatOpen = useStore((s) => s.chatOpen);
  const xrChatOpen = useStore((s) => s.xrChatOpen);
  const xrDock = useStore((s) => s.bringChat);
  const active = chatOpen || xrChatOpen || xrDock != null;
  const session = useProjectSession();
  const [threads, setThreads] = useState<ThreadRow[]>([]);

  const refreshThreads = useCallback(async () => {
    const res = await jsonApi.threads.$get();
    if (!res.ok) return;
    const rows = (await res.json()) as ThreadRow[];
    setThreads(rows);
    return rows;
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      await session.setThread(id);
      await refreshThreads();
    },
    [refreshThreads, session.setThread],
  );

  const newThread = useCallback(async () => {
    await session.newThread();
    await refreshThreads();
  }, [refreshThreads, session.newThread]);

  useEffect(() => {
    if (!active) return;
    void (async () => {
      await refreshThreads();
      if (!session.threadId) await session.ensureThread();
    })();
  }, [active, refreshThreads, session.threadId, session.ensureThread]);

  const value = useMemo(
    () => ({
      threads,
      threadId: session.threadId,
      initialMessages: session.messages as GalleryChatMessage[],
      refreshThreads,
      newThread,
      openThread,
    }),
    [threads, session.threadId, session.messages, refreshThreads, newThread, openThread],
  );

  return <ViewerChatContext.Provider value={value}>{children}</ViewerChatContext.Provider>;
}

export function useViewerChat() {
  const ctx = useContext(ViewerChatContext);
  if (!ctx) throw new Error("useViewerChat requires ViewerChatProvider");
  return ctx;
}

export function persistThread(threadId: string, messages: GalleryChatMessage[]) {
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
