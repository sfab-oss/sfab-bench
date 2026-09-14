import { useChat } from "@ai-sdk/react";
import { Check, Copy, EllipsisVertical, History, MessageCircleDashedIcon, PanelRight, Plus } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { ChatMessageRow } from "@/components/chat/chat-message-parts";
import { GalleryChatInput, type GalleryPromptMessage } from "@/components/chat/composer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { persistThread, useViewerChat } from "@/components/chat/useViewerChat";
import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import { useLiveShowArtifact } from "@/chat/useLiveShowArtifact";
import { LiveDot } from "@/components/brand/LiveDot";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
  const [live, setLive] = useState(false);
  const messagesRef = useRef<GalleryChatMessage[]>([]);
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
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
      style={{ width }}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize bg-transparent hover:bg-border",
          resizing && "bg-muted-foreground",
        )}
        onMouseDown={onResizeDown}
      />
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          title="Hide chat"
          onClick={() => setChatOpen(false)}
        >
          <PanelRight />
          <span className="sr-only">Hide chat</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          {live ? <LiveDot /> : null}
          <div className="min-w-0 truncate text-sm font-medium">{active?.title ?? "Assistant"}</div>
        </div>
        <ChatSettingsMenu
          onCopyJson={() =>
            copyConversationJson({
              id: threadId,
              title: active?.title ?? "Assistant",
              messages: messagesRef.current,
            })
          }
        />
        <Popover>
          <PopoverTrigger
            render={<Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Chat history" />}
          >
            <History />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            {threads.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <PopoverClose
                      className={cn(
                        "flex w-full truncate rounded-sm px-2 py-1.5 text-left text-sm",
                        t.id === threadId
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent",
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
      </header>
      {threadId ? (
        <ChatSession
          key={threadId}
          threadId={threadId}
          initialMessages={initialMessages}
          messagesRef={messagesRef}
          onLive={setLive}
          onPersist={() => void refreshThreads()}
        />
      ) : null}
    </aside>
  );
}

async function copyConversationJson(conversation: {
  id: string | null;
  title: string;
  messages: GalleryChatMessage[];
}) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(conversation, jsonSafe, 2));
    return true;
  } catch {
    return false;
  }
}

function jsonSafe(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof File !== "undefined" && value instanceof File) {
    return { type: "File", name: value.name, mimeType: value.type, size: value.size };
  }
  if (value instanceof ArrayBuffer) return { type: "ArrayBuffer", byteLength: value.byteLength };
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, length: value.byteLength };
  return value;
}

function ChatSettingsMenu({ onCopyJson }: { onCopyJson: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setCopied(false);
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Chat settings" />}
      >
        <EllipsisVertical />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
          onClick={() => {
            void onCopyJson().then((ok) => {
              if (ok) setCopied(true);
            });
          }}
        >
          {copied ? <Check className="size-4 shrink-0" /> : <Copy className="size-4 shrink-0" />}
          {copied ? "Copied" : "Copy conversation as JSON"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ChatSession({
  threadId,
  initialMessages,
  messagesRef,
  onLive,
  onPersist,
}: {
  threadId: string;
  initialMessages: GalleryChatMessage[];
  messagesRef: RefObject<GalleryChatMessage[]>;
  onLive: (live: boolean) => void;
  onPersist: () => void;
}) {
  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    throttle: 50,
    messages: initialMessages,
    transport: viewerChatTransport(),
    onFinish: ({ messages: next }) => {
      void persistThread(threadId, next as GalleryChatMessage[]).then(onPersist);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    onLive(busy);
    return () => onLive(false);
  }, [busy, onLive]);
  useLiveShowArtifact(messages as GalleryChatMessage[], busy);
  messagesRef.current = messages as GalleryChatMessage[];
  const streamingMessageId = busy && messages.at(-1)?.role === "assistant" ? (messages.at(-1)?.id ?? null) : null;

  const onSubmit = (payload: GalleryPromptMessage) => {
    const text = payload.text.trim();
    if (!text) return;
    void sendMessage({ text });
  };

  return (
    <>
      {error ? <div className="px-3 py-1 text-xs text-destructive">{error.message}</div> : null}
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-3 py-3">
              {messages.length === 0 ? (
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
                messages.map((message) => (
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
        status={status}
        disabled={busy}
      />
    </>
  );
}
