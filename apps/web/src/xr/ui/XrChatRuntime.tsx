import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import { findPendingAskUserQuestions, type AskUserQuestionsOutput } from "@/chat/ask-user-questions";
import { findPendingGetViewer } from "@/chat/get-viewer";
import { useLiveViewerTools } from "@/chat/useLiveViewerTools";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { messagePlainText, persistThread, useViewerChat } from "@/components/chat/useViewerChat";
import { finishPersistMessages } from "@/chat/persist-thread";
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
  pendingAsk: ReturnType<typeof findPendingAskUserQuestions>;
  answerAskUser: (toolCallId: string, output: AskUserQuestionsOutput) => void;
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

  const turnErrorRef = useRef<string | null>(null);
  const { messages, sendMessage, status, error, stop, addToolOutput } = useChat({
    id: threadId,
    throttle: 50,
    messages: initialMessages,
    transport: viewerChatTransport(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      turnErrorRef.current = err.message;
    },
    onFinish: ({ messages: next, isError }) => {
      const text = turnErrorRef.current;
      turnErrorRef.current = null;
      const toSave = finishPersistMessages(next as GalleryChatMessage[], isError, text);
      if (!toSave) return;
      void persistThread(threadId, toSave).then(onPersist);
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const pendingAsk = findPendingAskUserQuestions(messages);
  const pendingViewer = findPendingGetViewer(messages);
  useLiveViewerTools(messages as GalleryChatMessage[], addToolOutput, busy);
  busyRef.current = busy || pendingViewer !== null;

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || busyRef.current) return;
    const pending = findPendingAskUserQuestions(messages);
    if (pending) {
      const question = pending.input.questions[0];
      if (!question?.allowFreeForm) return;
      setDraft("");
      void addToolOutput({
        tool: "askUserQuestions",
        toolCallId: pending.toolCallId,
        output: {
          action: "answered",
          answers: { [question.id]: { optionIds: [], freeform: text } },
        },
      });
      return;
    }
    setDraft("");
    void sendMessage({ text });
  }, [addToolOutput, draft, messages, sendMessage]);

  sendRef.current = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    const pending = findPendingAskUserQuestions(messages);
    if (pending) {
      const question = pending.input.questions[0];
      if (!question?.allowFreeForm) return;
      void addToolOutput({
        tool: "askUserQuestions",
        toolCallId: pending.toolCallId,
        output: {
          action: "answered",
          answers: { [question.id]: { optionIds: [], freeform: trimmed } },
        },
      });
      return;
    }
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
    const waiting = busy || pendingViewer !== null;
    const phase = waiting ? (status === "streaming" ? "streaming" : "submitted") : "idle";
    store.getState().setXrChatPhase(phase);
    return () => store.getState().setXrChatPhase("idle");
  }, [busy, pendingViewer, status]);
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    store.getState().setXrChatChars(last ? messagePlainText(last as GalleryChatMessage).length : 0);
  }, [messages]);

  const value: XrChatRuntime = {
    messages: messages as GalleryChatMessage[],
    busy: busy || pendingViewer !== null,
    error,
    draft,
    setDraft,
    send,
    stop: () => {
      stop();
      void jsonApi["chat"].stop.$post();
    },
    pendingAsk,
    answerAskUser: (toolCallId, output) => {
      void addToolOutput({
        tool: "askUserQuestions",
        toolCallId,
        output,
      });
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
