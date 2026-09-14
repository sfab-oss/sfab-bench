import { useChat } from "@ai-sdk/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { messagePlainText, persistThread, useViewerChat } from "@/components/chat/useViewerChat";
import { useProjectSession } from "@/hooks/useProjectSession";
import { jsonApi } from "@/lib/api";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { store, useStore } from "@/state/store";

type Voice = ReturnType<typeof useVoiceInput>;

export type XrChatRuntime = {
  messages: GalleryChatMessage[];
  busy: boolean;
  error: Error | undefined;
  draft: string;
  setDraft: (value: string | ((cur: string) => string)) => void;
  send: () => void;
  stop: () => void;
  voice: Voice;
};

const XrChatRuntimeContext = createContext<XrChatRuntime | null>(null);

export function useXrChatRuntime() {
  return useContext(XrChatRuntimeContext);
}

function appendDraft(cur: string, text: string) {
  if (!cur.trim()) return text;
  return /[\s\n]$/.test(cur) ? `${cur}${text}` : `${cur} ${text}`;
}

function XrChatSessionRuntime({
  threadId,
  initialMessages,
  onPersist,
  children,
}: {
  threadId: string;
  initialMessages: GalleryChatMessage[];
  onPersist: () => void;
  children: ReactNode;
}) {
  const xrChatOpen = useStore((s) => s.xrChatOpen);
  const openRef = useRef(xrChatOpen);
  openRef.current = xrChatOpen;
  const [draft, setDraft] = useState("");
  const busyRef = useRef(false);
  const sendRef = useRef<(text: string) => void>(() => {});

  const session = useProjectSession();
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: threadId,
    throttle: 50,
    messages: initialMessages,
    transport: viewerChatTransport(),
    onFinish: ({ messages: next }) => {
      void persistThread(threadId, next as GalleryChatMessage[]).then(onPersist);
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const remoteBusy = session.status !== "idle" && !busy;
  const shown = busy ? messages : session.messages;
  busyRef.current = busy || remoteBusy;

  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    if (session.threadId !== threadId) return;
    setMessages(session.messages as GalleryChatMessage[]);
  }, [session.messages, session.threadId, status, threadId, setMessages]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || busyRef.current) return;
    setDraft("");
    void sendMessage({ text });
  }, [draft, sendMessage]);

  sendRef.current = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    void sendMessage({ text: trimmed });
  };

  const voice = useVoiceInput((text) => {
    if (openRef.current) {
      setDraft((cur) => appendDraft(cur, text));
      return;
    }
    sendRef.current(text);
  });

  useEffect(() => {
    const phase =
      busy || remoteBusy ? (session.status === "streaming" || status === "streaming" ? "streaming" : "submitted") : "idle";
    store.getState().setXrChatPhase(phase);
    return () => store.getState().setXrChatPhase("idle");
  }, [busy, remoteBusy, session.status, status]);
  useEffect(() => {
    const last = [...shown].reverse().find((m) => m.role === "assistant");
    store.getState().setXrChatChars(last ? messagePlainText(last as GalleryChatMessage).length : 0);
  }, [shown]);

  const value: XrChatRuntime = {
    messages: shown as GalleryChatMessage[],
    busy: busy || remoteBusy,
    error,
    draft,
    setDraft,
    send,
    stop: () => {
      stop();
      void jsonApi["chat"].stop.$post();
    },
    voice,
  };

  return <XrChatRuntimeContext.Provider value={value}>{children}</XrChatRuntimeContext.Provider>;
}

export function XrChatRuntimeProvider({ children }: { children: ReactNode }) {
  const { threadId, initialMessages, refreshThreads } = useViewerChat();
  if (!threadId) return children;
  return (
    <XrChatSessionRuntime
      key={threadId}
      threadId={threadId}
      initialMessages={initialMessages}
      onPersist={() => void refreshThreads()}
    >
      {children}
    </XrChatSessionRuntime>
  );
}
