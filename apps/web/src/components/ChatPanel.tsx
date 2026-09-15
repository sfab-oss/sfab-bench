import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Check, Copy, EllipsisVertical, History, MessageCircleDashedIcon, PanelRight, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { ChatMessageRow } from "@/components/chat/chat-message-parts";
import { GalleryChatInput, type GalleryChatHandle, type GalleryPromptMessage } from "@/components/chat/composer";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { persistThread, useViewerChat } from "@/components/chat/useViewerChat";
import { lastUserPromptText, mapChatErrorMessage, isWorkspaceBusyError } from "@/chat/composer-recovery";
import { resolveCadRef } from "@/chat/cad-refs";
import {
  decideNewChatAction,
  EMPTY_THREAD_TITLE,
  firstUserLine,
  formatRelativeTime,
  HISTORY_POLL_MS,
  isEmptyHistoryTitle,
  msUntilNextMinuteTick,
  partitionHistoryRows,
  threadRowPip,
  titleRefSegments,
  type ThreadPip,
} from "@/chat/history";
import { finishPersistMessages, isTurnErrorPart } from "@/chat/persist-thread";
import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import { findPendingAskUserQuestions, type AskUserQuestionsOutput } from "@/chat/ask-user-questions";
import { findPendingGetViewer } from "@/chat/get-viewer";
import { useLiveViewerTools } from "@/chat/useLiveViewerTools";
import { LiveDot } from "@/components/brand/LiveDot";
import { CrashCard } from "@/components/CrashCard";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
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
import { CHAT_DEFAULT_WIDTH, clampChatDrag } from "@/lib/layout";
import { partLabelFileStem } from "@/lib/part-label";
import { cn } from "@/lib/utils";
import { store, useStore } from "@/state/store";

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
  const [resizing, setResizing] = useState(false);
  const [live, setLive] = useState(false);
  const [currentEmpty, setCurrentEmpty] = useState(true);
  const [sessionPreview, setSessionPreview] = useState<string | null>(null);
  const [tabStatus, setTabStatus] = useState({ streaming: false, askUser: false, error: false });
  const messagesRef = useRef<GalleryChatMessage[]>([]);
  const compactOpenRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const stopTurnRef = useRef<(() => void) | null>(null);
  const captureDraftRef = useRef<(() => void) | null>(null);
  const composerRef = useRef<GalleryChatHandle>(null);
  const { threads, threadId, initialMessages, refreshThreads, newThread, openThread, registerTabTurn } =
    useViewerChat();
  useEffect(() => {
    void loadHarnesses();
  }, []);

  const onSessionMeta = useCallback(
    (meta: { empty: boolean; preview: string | null; streaming: boolean; askUser: boolean; error: boolean }) => {
      setCurrentEmpty(meta.empty);
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

  useEffect(() => {
    if (!compact || !open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        // Capture so we see popovers/selects before Base UI unmounts them.
        if (ev.defaultPrevented || floatingDismissOpen()) return;
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

  const onResizeDown = (ev: ReactMouseEvent) => {
    ev.preventDefault();
    setResizing(true);
    const startX = ev.clientX;
    const startW = width;
    const move = (e: MouseEvent) => {
      persistWidth(startW + (startX - e.clientX));
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

  const active = threads.find((t) => t.id === threadId);
  const headerTitle = active?.title ?? "Assistant";

  const startNewChat = () => {
    const decision = decideNewChatAction({ currentId: threadId, currentEmpty, threads });
    if (decision.action === "focus") {
      composerRef.current?.focus();
      return;
    }
    captureDraftRef.current?.();
    stopTurnRef.current?.();
    if (decision.action === "open") {
      void openThread(decision.id);
      return;
    }
    void newThread();
  };

  return (
    <>
      {compact && open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          aria-label="Close chat"
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        role={compact && open ? "dialog" : undefined}
        aria-modal={compact && open ? true : undefined}
        aria-label="Assistant"
        tabIndex={compact && open ? -1 : undefined}
        className={cn(
          "@container/chat flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden border-l border-border bg-background",
          compact ? "fixed inset-y-0 right-0 z-50 max-w-[90vw]" : "relative shrink-0",
          !open && "hidden",
        )}
        style={{ width }}
      >
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize bg-transparent hover:bg-border",
          resizing && "bg-muted-foreground",
        )}
        title="Drag to resize chat. Double-click to reset."
        onMouseDown={onResizeDown}
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
          onClick={onClose}
        >
          <PanelRight />
          <span className="sr-only">Hide chat</span>
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
  return Boolean(
    document.querySelector("[data-mention-list], [data-slot='popover-content'], [data-slot='select-content']"),
  );
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

function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval = 0;
    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), 60_000);
    }, msUntilNextMinuteTick(Date.now()));
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return now;
}

// A stable empty list: a fresh `[]` from the selector re-renders forever when no model is open.
const NO_PARTS: NonNullable<ReturnType<typeof store.getState>["review"]>["parts"] = [];

function CadRefTitle({ title, className }: { title: string; className?: string }) {
  const parts = useStore((s) => s.review?.parts ?? NO_PARTS);
  const fileLabel = useStore((s) => s.title);
  const fileStem = partLabelFileStem(parts.length, fileLabel);
  const segments = titleRefSegments(title, (ref) => resolveCadRef(ref, parts, fileStem)?.label ?? null);
  return (
    <span className={className} title={title}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span key={`${seg.ref}-${i}`} title={seg.ref}>
            {seg.label}
          </span>
        ),
      )}
    </span>
  );
}

function StatusPip({ pip }: { pip: ThreadPip }) {
  if (!pip) return null;
  const label = pip === "streaming" ? "Replying" : pip === "ask-user" ? "Waiting on you" : "Error";
  if (pip === "streaming") {
    return <LiveDot className="animate-pulse" title={label} />;
  }
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        pip === "ask-user" ? "bg-amber-500" : "bg-destructive",
      )}
      title={label}
    />
  );
}

function HistoryPopover({
  threads,
  threadId,
  currentEmpty,
  currentPreview,
  currentStatus,
  refreshThreads,
  onOpenThread,
}: {
  threads: { id: string; title: string; updated_at: number }[];
  threadId: string | null;
  currentEmpty: boolean;
  currentPreview: string | null;
  currentStatus: { streaming: boolean; askUser: boolean; error: boolean };
  refreshThreads: () => Promise<unknown>;
  onOpenThread: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const now = useMinuteTick();

  const refresh = useCallback(async () => {
    const rows = await refreshThreads();
    setRefreshError(rows === undefined);
  }, [refreshThreads]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), HISTORY_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  const { visible, emptyHidden } = partitionHistoryRows(threads, threadId, currentEmpty);
  const rows = showEmpty ? [...visible, ...emptyHidden] : visible;

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShowEmpty(false);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Chat history"
            aria-label="Chat history"
          />
        }
      >
        <History />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        {refreshError ? (
          <div className="px-2 py-1 text-[11px] text-destructive" role="status">
            Couldn't refresh
          </div>
        ) : null}
        {threads.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
        ) : (
          <ul className="max-h-80 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            {rows.map((t) => {
              const current = t.id === threadId;
              const empty = current ? currentEmpty : isEmptyHistoryTitle(t.title);
              const preview = current && isEmptyHistoryTitle(t.title) ? currentPreview : null;
              const pip = threadRowPip({
                rowId: t.id,
                currentId: threadId,
                streaming: currentStatus.streaming,
                askUser: currentStatus.askUser,
                error: currentStatus.error,
              });
              return (
                <li key={t.id}>
                  <PopoverClose
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left",
                      current ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent",
                      empty && !current && "text-muted-foreground",
                    )}
                    onClick={() => onOpenThread(t.id)}
                  >
                    <StatusPip pip={pip} />
                    <span className="min-w-0 flex-1">
                      <CadRefTitle
                        className="block truncate text-sm"
                        title={t.title.trim() ? t.title : EMPTY_THREAD_TITLE}
                      />
                      {preview ? (
                        <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                          <CadRefTitle title={preview} />
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] font-normal text-muted-foreground">
                      {formatRelativeTime(t.updated_at, now)}
                    </span>
                  </PopoverClose>
                </li>
              );
            })}
          </ul>
        )}
        {emptyHidden.length > 0 ? (
          <button
            type="button"
            className="mt-0.5 w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setShowEmpty((v) => !v)}
          >
            {showEmpty ? "Hide empty" : `Show empty (${emptyHidden.length})`}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
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
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
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
  onLive: (live: boolean) => void;
  onMeta: (meta: { empty: boolean; preview: string | null; streaming: boolean; askUser: boolean; error: boolean }) => void;
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
      void persistThread(threadId, toSave).then(onPersist);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const pendingAsk = findPendingAskUserQuestions(messages);
  const pendingViewer = findPendingGetViewer(messages);
  const live = busy || pendingViewer !== null;
  const loadingModel = pendingViewer !== null || progress !== null;
  const abortWorkspaceTurn = useCallback(() => {
    stop();
    void jsonApi["chat"].stop.$post();
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
      empty: messages.length === 0,
      preview: firstUserLine(messages),
      streaming: busy,
      askUser: pendingAsk !== null,
      error: liveError || Boolean(tailErrorId),
    });
  }, [messages, busy, pendingAsk, liveError, tailErrorId, onMeta]);

  return (
    <>
      {liveError && errorText ? (
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-destructive">
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
