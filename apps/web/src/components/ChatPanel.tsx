import { useChat } from "@ai-sdk/react";
import { History, MessageCircleDashedIcon, Plus, X } from "lucide-react";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

import { ChatMessageRow } from "@/components/chat/chat-message-parts";
import { GalleryChatInput, type GalleryPromptMessage } from "@/components/chat/composer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { persistThread, useViewerChat } from "@/components/chat/useViewerChat";
import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import { useProjectSession } from "@/hooks/useProjectSession";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { loadHarnesses } from "@/hooks/useHarnesses";
import { jsonApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CHAT_MAX_WIDTH, CHAT_MIN_WIDTH, useStore } from "@/state/store";

export function ChatPanel() {
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const width = useStore((s) => s.chatWidth);
  const setWidth = useStore((s) => s.setChatWidth);
  const [resizing, setResizing] = useState(false);
  const { threads, threadId, initialMessages, refreshThreads, newThread, openThread } = useViewerChat();
  useEffect(() => {
    void loadHarnesses();
  }, []);

  const onResizeDown = (ev: ReactMouseEvent) => {
    ev.preventDefault();
    setResizing(true);
    const startX = ev.clientX;
    const startW = width;
    const move = (e: MouseEvent) => {
      setWidth(Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, startW + (startX - e.clientX))));
    };
    const up = () => {
      setResizing(false);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  if (!chatOpen) return null;

  const active = threads.find((t) => t.id === threadId);

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-200 bg-white"
      style={{ width }}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize bg-transparent hover:bg-zinc-400",
          resizing && "bg-zinc-500",
        )}
        onMouseDown={onResizeDown}
      />
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 px-2">
        <div className="min-w-0 flex-1 truncate px-2 text-sm font-medium">
          {active?.title ?? "Assistant"}
        </div>
        <Popover>
          <PopoverTrigger
            render={<Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Chat history" />}
          >
            <History />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            {threads.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-zinc-500">No chats yet</div>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <PopoverClose
                      className={cn(
                        "flex w-full truncate rounded-sm px-2 py-1.5 text-left text-sm",
                        t.id === threadId
                          ? "bg-zinc-100 font-medium text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-50",
                      )}
                      onClick={() => void openThread(t.id)}
                    >
                      {t.title}
                    </PopoverClose>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="New chat" onClick={() => void newThread()}>
          <Plus />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Close chat" onClick={() => setChatOpen(false)}>
          <X />
        </Button>
      </header>
      {threadId ? (
        <ChatSession
          key={threadId}
          threadId={threadId}
          initialMessages={initialMessages}
          onPersist={() => void refreshThreads()}
        />
      ) : null}
    </aside>
  );
}

function ChatSession({
  threadId,
  initialMessages,
  onPersist,
}: {
  threadId: string;
  initialMessages: GalleryChatMessage[];
  onPersist: () => void;
}) {
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

  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    if (session.threadId !== threadId) return;
    setMessages(session.messages as GalleryChatMessage[]);
  }, [session.messages, session.threadId, status, threadId, setMessages]);

  const busy = status === "submitted" || status === "streaming";
  const remoteBusy = session.status !== "idle" && !busy;
  const shown = busy ? messages : (session.messages as GalleryChatMessage[]);
  const streamingMessageId =
    (busy || remoteBusy) && shown.at(-1)?.role === "assistant" ? (shown.at(-1)?.id ?? null) : null;

  const onSubmit = (payload: GalleryPromptMessage) => {
    const text = payload.text.trim();
    if (!text) return;
    void sendMessage({ text });
  };

  return (
    <>
      {error ? <div className="px-3 py-1 text-xs text-red-600">{error.message}</div> : null}
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-3 py-3">
              {shown.length === 0 ? (
                <Empty className="h-full border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageCircleDashedIcon />
                    </EmptyMedia>
                    <EmptyTitle>How can I help?</EmptyTitle>
                    <EmptyDescription>
                      Ask for a CAD change. Try “What am I looking at?” then a size change.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                shown.map((message) => (
                  <MessageScrollerItem key={message.id}>
                    <ChatMessageRow
                      isStreaming={streamingMessageId === message.id}
                      message={message as GalleryChatMessage}
                    />
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <GalleryChatInput
        onSubmit={onSubmit}
        onStop={() => {
          stop();
          void jsonApi["chat"].stop.$post();
        }}
        placeholder="Ask for a change…"
        status={busy ? status : remoteBusy ? "submitted" : status}
        disabled={busy || remoteBusy}
      />
    </>
  );
}
