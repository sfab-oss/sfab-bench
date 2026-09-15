import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Check, Copy, EllipsisVertical, MessageCircleDashedIcon, PanelRight, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { CadRefTitle } from "@/components/chat/CadRefTitle";
import { ChatMessageRow } from "@/components/chat/chat-message-parts";
import { GalleryChatInput, type GalleryChatHandle, type GalleryPromptMessage } from "@/components/chat/composer";
import { HistoryPopover } from "@/components/chat/HistoryPopover";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import {
  peekThreadMessages,
  persistThread,
  readSavedThread,
  useViewerChat,
} from "@/components/chat/useViewerChat";
import { lastUserPromptText, mapChatErrorMessage, isWorkspaceBusyError } from "@/chat/composer-recovery";
import { currentThreadIsEmpty, decideNewChatAction, firstUserLine } from "@/chat/history";
import { finishPersistMessages, isTurnErrorPart } from "@/chat/persist-thread";
import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import { findPendingAskUserQuestions, type AskUserQuestionsOutput } from "@/chat/ask-user-questions";
import { findPendingGetViewer } from "@/chat/get-viewer";
import { useLiveViewerTools } from "@/chat/useLiveViewerTools";
import { LiveDot } from "@/components/brand/LiveDot";
import { CrashCard } from "@/components/CrashCard";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { Button } from "@/components/ui/button";
import { showNetworkErrorToast, showToast } from "@/components/ui/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { useProjectSession } from "@/hooks/useProjectSession";
import { jsonApi } from "@/lib/api";
import { HIDDEN_CHAT_NOTICE, hiddenChatNotice } from "@/lib/feedback";
import { CHAT_DEFAULT_WIDTH, CHAT_MAX_WIDTH, CHAT_MIN_WIDTH, chatWidthAfterKey, clampChatDrag } from "@/lib/layout";
import { escBelongsTo, probeEscLayers } from "@/lib/shortcuts";
import { NEW_CHAT_EVENT, registerPaletteOwner } from "@/lib/command-palette";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

export function ChatPanel({
  width,
  onClose,
  open = true,
  compact = false,
  toggleRef,
}: {
  width: number;
  onClose: () => void;
  open?: boolean;
  compact?: boolean;
  toggleRef?: RefObject<HTMLButtonElement | null>;
}) {
  const treeOpen = useStore((s) => s.treeOpen);
  const setWidth = useStore((s) => s.setChatWidth);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setCompactChatOpen = useStore((s) => s.setCompactChatOpen);
  const [resizing, setResizing] = useState(false);
  const [live, setLive] = useState(false);
  const [sessionPreview, setSessionPreview] = useState<string | null>(null);
  const [tabStatus, setTabStatus] = useState({ streaming: false, askUser: false, error: false });
  const prevTabStatus = useRef(tabStatus);
  const messagesRef = useRef<GalleryChatMessage[]>([]);
  const messagesThreadIdRef = useRef<string | null>(null);
  const newChatLock = useRef(false);
  const compactOpenRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const stopTurnRef = useRef<(() => void) | null>(null);
  const captureDraftRef = useRef<(() => void) | null>(null);
  const composerRef = useRef<GalleryChatHandle>(null);
  const projectPath = useProjectSession().project.path;
  const { threads, threadId, initialMessages, refreshThreads, newThread, openThread, registerTabTurn } =
    useViewerChat();
  useEffect(() => {
    void loadHarnesses();
  }, []);
  useEffect(() => {
    const prev = prevTabStatus.current;
    prevTabStatus.current = tabStatus;
    const kind = hiddenChatNotice(!open, prev, tabStatus);
    if (!kind) return;
    showToast({
      type: kind === "failed" ? "error" : "info",
      title: HIDDEN_CHAT_NOTICE[kind],
      action: {
        label: "Show chat",
        onClick: () => (compact ? setCompactChatOpen(true) : setChatOpen(true)),
      },
    });
  }, [open, tabStatus, compact, setChatOpen, setCompactChatOpen]);

  const onSessionMeta = useCallback(
    (meta: { preview: string | null; streaming: boolean; askUser: boolean; error: boolean }) => {
      setSessionPreview(meta.preview);
      setTabStatus((prev) =>
        prev.streaming === meta.streaming && prev.askUser === meta.askUser && prev.error === meta.error
          ? prev
          : { streaming: meta.streaming, askUser: meta.askUser, error: meta.error },
      );
    },
    [],
  );

  const persistWidth = useCallback(
    (next: number) => {
      setWidth(clampChatDrag(next, window.innerWidth, treeOpen));
    },
    [setWidth, treeOpen],
  );
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (!resizing) return;
    if (!open) {
      setResizing(false);
      return;
    }
    const move = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      persistWidth(drag.startW + (drag.startX - e.clientX));
    };
    const up = () => {
      setResizing(false);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [resizing, open, persistWidth]);

  useEffect(() => {
    const wasCompactOpen = compactOpenRef.current;
    const isCompactOpen = compact && open;
    compactOpenRef.current = isCompactOpen;
    if (isCompactOpen && !wasCompactOpen) {
      const el = document.querySelector<HTMLElement>("[data-chat-composer] .ProseMirror");
      el?.focus();
      return;
    }
    if (wasCompactOpen && compact && !open) {
      toggleRef?.current?.focus();
    }
  }, [compact, open, toggleRef]);

  // Hidden chat stays mounted (docked or compact), so stop any recording when it closes.
  useEffect(() => {
    if (!open) composerRef.current?.cancelVoice();
  }, [open]);

  useEffect(() => {
    if (!compact || !open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        // Capture so we see popovers/selects before Base UI unmounts them.
        if (ev.defaultPrevented) return;
        const layers = { ...probeEscLayers(document), compactChat: true };
        if (!escBelongsTo("compact-chat", layers)) return;
        ev.preventDefault();
        onClose();
        return;
      }
      if (ev.key !== "Tab" || floatingDismissOpen()) return;
      backwards = ev.shiftKey;
      wrapTab(ev, panelRef.current);
    };
    // Tab order can leave the panel from any element, not only the last one; pull focus back.
    let backwards = false;
    const onFocusIn = (ev: FocusEvent) => {
      const root = panelRef.current;
      const target = ev.target;
      if (!root || !(target instanceof HTMLElement) || root.contains(target)) return;
      if (floatingDismissOpen() || target.closest("[data-mention-list]")) return;
      const nodes = tabbableIn(root);
      (backwards ? nodes[nodes.length - 1] : nodes[0])?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [compact, open, onClose]);

  const onResizeKeyDown = (ev: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = chatWidthAfterKey(ev.key, ev.shiftKey, width, window.innerWidth, treeOpen);
    if (next == null) return;
    ev.preventDefault();
    persistWidth(next);
  };

  const resizeMax = clampChatDrag(CHAT_MAX_WIDTH, typeof window === "undefined" ? width : window.innerWidth, treeOpen);

  const onResizeDown = (ev: ReactMouseEvent) => {
    ev.preventDefault();
    dragRef.current = { startX: ev.clientX, startW: width };
    setResizing(true);
  };

  const active = threads.find((t) => t.id === threadId);
  const headerTitle = active?.title ?? "Assistant";
  const currentEmpty = currentThreadIsEmpty({
    threadId,
    liveThreadId: messagesThreadIdRef.current,
    liveCount: messagesRef.current.length,
    initialCount: initialMessages.length,
  });

  const startNewChat = () => {
    if (newChatLock.current) return;
    newChatLock.current = true;
    void (async () => {
      try {
        const emptyNow = currentThreadIsEmpty({
          threadId,
          liveThreadId: messagesThreadIdRef.current,
          liveCount: messagesRef.current.length,
          initialCount: initialMessages.length,
        });
        const saved = readSavedThread(projectPath);
        const skipIds = saved && saved !== threadId ? [saved] : [];
        const rejected = new Set<string>();
        while (true) {
          const decision = decideNewChatAction({
            currentId: threadId,
            currentEmpty: emptyNow,
            threads,
            skipIds,
            rejectedIds: rejected,
          });
          if (decision.action === "focus") {
            composerRef.current?.focus();
            return;
          }
          if (decision.action === "create") {
            captureDraftRef.current?.();
            stopTurnRef.current?.();
            await newThread();
            return;
          }
          const peeked = await peekThreadMessages(decision.id);
          if (peeked && peeked.length === 0) {
            captureDraftRef.current?.();
            stopTurnRef.current?.();
            await openThread(decision.id);
            return;
          }
          rejected.add(decision.id);
        }
      } finally {
        newChatLock.current = false;
      }
    })();
  };

  const startNewChatRef = useRef(startNewChat);
  startNewChatRef.current = startNewChat;
  useEffect(() => {
    const onNewChat = () => startNewChatRef.current();
    window.addEventListener(NEW_CHAT_EVENT, onNewChat);
    return () => window.removeEventListener(NEW_CHAT_EVENT, onNewChat);
  }, []);
  useEffect(() => registerPaletteOwner("new-chat"), []);

  return (
    <>
      {compact ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          aria-label="Close chat"
          className={cn(
            "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        role={compact && open ? "dialog" : undefined}
        aria-modal={compact && open ? true : undefined}
        aria-label="Assistant"
        aria-hidden={compact && !open ? true : undefined}
        inert={compact && !open ? true : undefined}
        className={cn(
          "@container/chat flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden border-l border-border bg-background",
          compact
            ? cn(
                "fixed inset-y-0 right-0 z-50 max-w-[90vw] transition-transform duration-200 ease-out",
                open ? "translate-x-0" : "pointer-events-none translate-x-full",
              )
            : "relative shrink-0",
          !compact && !open && "hidden",
        )}
        style={{ width }}
      >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat"
        aria-valuemin={CHAT_MIN_WIDTH}
        aria-valuemax={resizeMax}
        aria-valuenow={width}
        tabIndex={0}
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize bg-transparent outline-none hover:bg-border focus-visible:bg-border focus-visible:ring-2 focus-visible:ring-ring/50",
          resizing && "bg-muted-foreground",
        )}
        title="Drag to resize chat. Double-click to reset."
        onMouseDown={onResizeDown}
        onKeyDown={onResizeKeyDown}
        onDoubleClick={(ev) => {
          ev.preventDefault();
          persistWidth(CHAT_DEFAULT_WIDTH);
        }}
      />
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          title="Hide chat"
          aria-label="Hide chat"
          onClick={onClose}
        >
          <PanelRight />
        </Button>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          {live ? <LiveDot /> : null}
          <CadRefTitle className="min-w-0 truncate text-sm font-medium" title={headerTitle} />
        </div>
        <ChatExportMenu
          onCopyJson={() =>
            copyConversationJson({
              id: threadId,
              title: active?.title ?? "Assistant",
              messages: messagesRef.current,
            })
          }
        />
        <HistoryPopover
          currentEmpty={currentEmpty}
          currentPreview={sessionPreview}
          currentStatus={tabStatus}
          onOpenThread={(id) => {
            if (id === threadId) return;
            captureDraftRef.current?.();
            stopTurnRef.current?.();
            void openThread(id);
          }}
          refreshThreads={refreshThreads}
          threadId={threadId}
          threads={threads}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="New chat"
          aria-label="New chat"
          onClick={startNewChat}
        >
          <Plus />
        </Button>
      </header>
      <RenderErrorBoundary
        resetKeys={[threadId]}
        fallback={({ error, reset }) => (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <CrashCard error={error} onRetry={reset} />
          </div>
        )}
      >
        {threadId ? (
          <ChatSession
            key={threadId}
            threadId={threadId}
            initialMessages={initialMessages}
            messagesRef={messagesRef}
            messagesThreadIdRef={messagesThreadIdRef}
            onLive={setLive}
            onMeta={onSessionMeta}
            onPersist={() => void refreshThreads()}
            registerTabTurn={registerTabTurn}
            stopTurnRef={stopTurnRef}
            captureDraftRef={captureDraftRef}
            composerRef={composerRef}
          />
        ) : null}
      </RenderErrorBoundary>
    </aside>
    </>
  );
}

function floatingDismissOpen(): boolean {
  const probe = probeEscLayers(document);
  return Boolean(probe.mention || probe.popoverOrSelect || probe.dialog);
}

function tabbableIn(root: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    if (el.tabIndex < 0) return false;
    if (el.closest("[aria-hidden='true']")) return false;
    return el.getClientRects().length > 0;
  });
}

function wrapTab(ev: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const active = document.activeElement;
  if (active instanceof Node && !root.contains(active)) return;
  const nodes = tabbableIn(root);
  if (nodes.length === 0) {
    ev.preventDefault();
    root.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (ev.shiftKey && active === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
  }
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


function ChatExportMenu({ onCopyJson }: { onCopyJson: () => Promise<boolean> }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setCopied("idle");
      }}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Export" aria-label="Export" />
        }
      >
        <EllipsisVertical />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => {
            void onCopyJson().then((ok) => {
              setCopied(ok ? "copied" : "error");
            });
          }}
        >
          {copied === "copied" ? <Check className="size-4 shrink-0" /> : <Copy className="size-4 shrink-0" />}
          {copied === "copied" ? "Copied" : copied === "error" ? "Couldn't copy" : "Copy conversation as JSON"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ChatSession({
  threadId,
  initialMessages,
  messagesRef,
  messagesThreadIdRef,
  onLive,
  onMeta,
  onPersist,
  registerTabTurn,
  stopTurnRef,
  captureDraftRef,
  composerRef,
}: {
  threadId: string;
  initialMessages: GalleryChatMessage[];
  messagesRef: RefObject<GalleryChatMessage[]>;
  messagesThreadIdRef: RefObject<string | null>;
  onLive: (live: boolean) => void;
  onMeta: (meta: { preview: string | null; streaming: boolean; askUser: boolean; error: boolean }) => void;
  onPersist: () => void;
  registerTabTurn: (streaming: boolean, stop: (() => void) | null) => void;
  stopTurnRef: RefObject<(() => void) | null>;
  captureDraftRef: RefObject<(() => void) | null>;
  composerRef: RefObject<GalleryChatHandle | null>;
}) {
  const turnErrorRef = useRef<string | null>(null);
  const progress = useStore((s) => s.progress);
  const url = useStore((s) => s.url);
  const { messages, sendMessage, status, error, stop, regenerate, addToolOutput } = useChat({
    id: threadId,
    throttle: 50,
    messages: initialMessages,
    transport: viewerChatTransport(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      turnErrorRef.current = mapChatErrorMessage(err) ?? err.message;
    },
    onFinish: ({ messages: next, isError }) => {
      const text = turnErrorRef.current;
      turnErrorRef.current = null;
      const toSave = finishPersistMessages(next as GalleryChatMessage[], isError, text);
      if (!toSave) return;
      void persistThread(threadId, toSave).then(
        (res) => {
          if (res && "ok" in res && res.ok === false) {
            showNetworkErrorToast({ title: "Couldn't save this chat" });
            return;
          }
          onPersist();
        },
        () => {
          showNetworkErrorToast({ title: "Couldn't save this chat" });
        },
      );
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const pendingAsk = findPendingAskUserQuestions(messages);
  const pendingViewer = findPendingGetViewer(messages);
  const live = busy || pendingViewer !== null;
  const loadingModel = pendingViewer !== null || progress !== null;
  const abortWorkspaceTurn = useCallback(() => {
    stop();
    void jsonApi["chat"].stop.$post().then(
      (res) => {
        if (!res.ok) showNetworkErrorToast({ title: "Couldn't stop the reply" });
      },
      () => {
        showNetworkErrorToast({ title: "Couldn't stop the reply" });
      },
    );
  }, [stop]);
  useEffect(() => {
    captureDraftRef.current = () => composerRef.current?.captureDraft();
    return () => {
      captureDraftRef.current = null;
    };
  }, [captureDraftRef]);
  useEffect(() => {
    if (!live) {
      stopTurnRef.current = null;
      return;
    }
    stopTurnRef.current = abortWorkspaceTurn;
    return () => {
      stopTurnRef.current = null;
    };
  }, [live, abortWorkspaceTurn, stopTurnRef]);
  useEffect(() => {
    registerTabTurn(busy, busy ? abortWorkspaceTurn : null);
    return () => registerTabTurn(false, null);
  }, [busy, abortWorkspaceTurn, registerTabTurn]);
  useEffect(() => {
    onLive(live);
    return () => onLive(false);
  }, [live, onLive]);
  useLiveViewerTools(messages as GalleryChatMessage[], addToolOutput, busy);
  messagesRef.current = messages as GalleryChatMessage[];
  messagesThreadIdRef.current = threadId;
  const streamingMessageId = busy && messages.at(-1)?.role === "assistant" ? (messages.at(-1)?.id ?? null) : null;
  const lastPrompt = lastUserPromptText(messages);

  const onSubmit = (payload: GalleryPromptMessage) => {
    const text = payload.text.trim();
    if (!text) return;
    void sendMessage({ text });
  };

  const retryFailedTurn = () => {
    composerRef.current?.clear();
    void regenerate();
  };

  const onAnswerAskUser = useCallback(
    (toolCallId: string, output: AskUserQuestionsOutput) => {
      void addToolOutput({
        tool: "askUserQuestions",
        toolCallId,
        output,
      });
    },
    [addToolOutput],
  );

  const errorText = mapChatErrorMessage(error);
  const errorIsBusy = isWorkspaceBusyError(error);
  const liveError = status === "error";
  const lastMessage = messages.at(-1);
  const tailErrorId =
    !liveError &&
    lastMessage?.role === "assistant" &&
    (lastMessage.parts ?? []).some(isTurnErrorPart)
      ? lastMessage.id
      : null;

  useEffect(() => {
    onMeta({
      preview: firstUserLine(messages),
      streaming: busy,
      askUser: pendingAsk !== null,
      error: liveError || Boolean(tailErrorId),
    });
  }, [messages, busy, pendingAsk, liveError, tailErrorId, onMeta]);

  return (
    <>
      {liveError && errorText ? (
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-error">
          <span className="min-w-0 flex-1">{errorText}</span>
          {errorIsBusy ? (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={abortWorkspaceTurn}>
              Stop
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={retryFailedTurn}>
              Retry
            </Button>
          )}
        </div>
      ) : null}
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
                      onRetry={tailErrorId === message.id ? retryFailedTurn : undefined}
                    />
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          {pendingAsk ? null : <MessageScrollerButton />}
        </MessageScroller>
      </MessageScrollerProvider>
      <GalleryChatInput
        canStop={pendingViewer !== null}
        historyMessages={messages}
        loadingModel={loadingModel}
        modelLoaded={Boolean(url) && progress === null}
        onAnswerAskUser={onAnswerAskUser}
        onStop={abortWorkspaceTurn}
        onSubmit={onSubmit}
        pendingAsk={pendingAsk}
        ref={composerRef}
        restorePrompt={status === "error" ? lastPrompt : null}
        status={status}
        threadId={threadId}
      />
    </>
  );
}
