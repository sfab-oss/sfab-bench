import { useChat } from "@ai-sdk/react";
import type { ChatAddToolOutputFunction } from "ai";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import {
  Check,
  Copy,
  EllipsisVertical,
  MessageCircleDashedIcon,
} from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  answerClientTool,
  assistantHasUnresolvedTool,
  shownFileFrom,
} from "@/chat/answer-client-tool";
import {
  type AskUserQuestionsOutput,
  findPendingAskUserQuestions,
} from "@/chat/ask-user-questions";
import {
  isWorkspaceBusyError,
  lastUserPromptText,
  mapChatErrorMessage,
} from "@/chat/composer-recovery";
import { firstUserLine } from "@/chat/history";
import { finishPersistMessages, isTurnErrorPart } from "@/chat/persist-thread";
import { useLiveDeviceTools } from "@/chat/useLiveDeviceTools";
import { useLiveViewerTools } from "@/chat/useLiveViewerTools";
import { viewerChatTransport } from "@/chat/viewer-chat-runtime";
import {
  type GalleryChatHandle,
  GalleryChatInput,
  type GalleryPromptMessage,
} from "@/components/chat/chat-input";
import { ChatMessageRow } from "@/components/chat/chat-message-parts";
import type { GalleryChatMessage } from "@/components/chat/mock-chat-messages";
import { persistThread } from "@/components/chat/useViewerChat";
import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showNetworkErrorToast } from "@/components/ui/toast";
import { jsonApi } from "@/lib/api";
import { useExperience } from "@/lib/experience";
import { copyText } from "@/lib/settings";
import { useStore } from "@/state/store";

export async function copyConversationJson(conversation: {
  id: string | null;
  title: string;
  messages: GalleryChatMessage[];
}) {
  return copyText(JSON.stringify(conversation, null, 2));
}

export function ChatExportMenu({
  onCopyJson,
}: {
  onCopyJson: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setCopied("idle");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Export"
            aria-label="Export"
          />
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
          {copied === "copied" ? (
            <Check className="size-4 shrink-0" />
          ) : (
            <Copy className="size-4 shrink-0" />
          )}
          {copied === "copied"
            ? "Copied"
            : copied === "error"
              ? "Couldn't copy"
              : "Copy conversation as JSON"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ChatSession({
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
  onMeta: (meta: {
    preview: string | null;
    streaming: boolean;
    askUser: boolean;
    error: boolean;
  }) => void;
  onPersist: () => void;
  registerTabTurn: (streaming: boolean, stop: (() => void) | null) => void;
  stopTurnRef: RefObject<(() => void) | null>;
  captureDraftRef: RefObject<(() => void) | null>;
  composerRef: RefObject<GalleryChatHandle | null>;
}) {
  const turnErrorRef = useRef<string | null>(null);
  const progress = useStore((s) => s.progress);
  const url = useStore((s) => s.url);
  const deviceMode = useExperience() === "device";
  const deviceModeRef = useRef(deviceMode);
  deviceModeRef.current = deviceMode;
  const addToolOutputRef =
    useRef<ChatAddToolOutputFunction<GalleryChatMessage> | null>(null);
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    addToolOutput,
    setMessages,
  } = useChat({
    id: threadId,
    throttle: 50,
    messages: initialMessages,
    transport: viewerChatTransport(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      const add = addToolOutputRef.current;
      if (!add) return;
      answerClientTool(
        toolCall,
        add,
        deviceModeRef.current ? "device" : "cad",
        () => shownFileFrom(messagesRef.current)
      );
    },
    onError: (err) => {
      turnErrorRef.current = mapChatErrorMessage(err) ?? err.message;
    },
    onFinish: ({ messages: next, isError }) => {
      const text = turnErrorRef.current;
      turnErrorRef.current = null;
      const toSave = finishPersistMessages(
        next as GalleryChatMessage[],
        isError,
        text
      );
      if (!toSave) return;
      // Persist already stamps data-error; live state must use it or the turn
      // collapses to a Worked chip until reload.
      if (isError) setMessages(toSave);
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
        }
      );
    },
  });
  addToolOutputRef.current = addToolOutput;
  const busy = status === "submitted" || status === "streaming";
  const pendingAsk = findPendingAskUserQuestions(messages);
  const awaitingTool = assistantHasUnresolvedTool(messages);
  const live = busy;
  const loadingModel = progress !== null;
  const abortWorkspaceTurn = useCallback(() => {
    stop();
    void jsonApi["chat"].stop.$post().then(
      (res) => {
        if (!res.ok)
          showNetworkErrorToast({ title: "Couldn't stop the reply" });
      },
      () => {
        showNetworkErrorToast({ title: "Couldn't stop the reply" });
      }
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
  useLiveViewerTools(messages as GalleryChatMessage[], busy, !deviceMode);
  useLiveDeviceTools(messages as GalleryChatMessage[], busy, deviceMode);
  messagesRef.current = messages as GalleryChatMessage[];
  messagesThreadIdRef.current = threadId;
  const streamingMessageId =
    busy && messages.at(-1)?.role === "assistant"
      ? (messages.at(-1)?.id ?? null)
      : null;
  const lastPrompt = lastUserPromptText(messages);

  const onSubmit = (payload: GalleryPromptMessage) => {
    const text = payload.text.trim();
    if (!text || awaitingTool) return;
    void sendMessage({ text });
  };

  const retryFailedTurn = () => {
    const last = messages.at(-1);
    if (last?.role === "user") {
      void sendMessage();
      return;
    }
    const text = lastUserPromptText(messages);
    if (!text) return;
    void sendMessage({ text });
  };

  const onAnswerAskUser = useCallback(
    (toolCallId: string, output: AskUserQuestionsOutput) => {
      addToolOutput({
        tool: "askUserQuestions",
        toolCallId,
        output,
      });
    },
    [addToolOutput]
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={abortWorkspaceTurn}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={retryFailedTurn}
            >
              Retry
            </Button>
          )}
        </div>
      ) : null}
      <MessageScrollerProvider autoScroll>
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
                      {deviceMode
                        ? "Ask it to run the open image and read the serial log."
                        : "Ask for a CAD change. Try “What am I looking at?” then a size change."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                    className={
                      streamingMessageId === message.id
                        ? "[content-visibility:visible]"
                        : undefined
                    }
                  >
                    <ChatMessageRow
                      isStreaming={streamingMessageId === message.id}
                      message={message as GalleryChatMessage}
                      onRetry={
                        tailErrorId === message.id ? retryFailedTurn : undefined
                      }
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
        awaitingTool={awaitingTool}
        loadingModel={deviceMode ? false : loadingModel}
        modelLoaded={deviceMode ? false : Boolean(url) && progress === null}
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
