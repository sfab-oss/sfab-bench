import type { ChatStatus } from "ai";
import { Hash, Mic } from "lucide-react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject, type Ref, type RefObject } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  askUserComposerPlaceholder,
  type AskUserQuestion,
  type AskUserQuestionsInput,
  type AskUserQuestionsOutput,
} from "@/chat/ask-user-questions";
import {
  CAD_MENTION_FACE_CAP,
  cadMentionQueryCloses,
  filterCadMentionCatalog,
  type CadMentionCatalogPart,
  type CadMentionItem,
} from "@/chat/cad-refs";
import {
  buildPromptHistoryEntries,
  captureSessionDraft,
  COMPOSER_HINT,
  composerPlaceholder,
  getSessionDraft,
  mentionLabelsForPrompt,
  providerSendBlockReason,
  sendDisabledReason,
  setSessionDraft,
  stepPromptHistory,
  type PromptHistoryMessage,
  type PromptHistoryPosition,
} from "@/chat/composer-recovery";
import { AskUserQuestionsPanel, type AskUserQuestionsHandle } from "@/components/chat/AskUserQuestionsPanel";
import {
  Composer,
  ComposerEditor,
  type ComposerHandle,
  ComposerMentionButton,
  ComposerSubmitButton,
} from "@/components/ui/composer";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import { useHarnesses } from "@/hooks/useHarnesses";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { HARNESS_LABEL } from "@/lib/harness";
import { partLabelFileStem } from "@/lib/part-label";
import { compactChatSheetOpen, escBelongsTo, probeEscLayers } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import { EffortSelect } from "./EffortSelect";
import { ModelPicker } from "./ModelPicker";
import { ProviderStatus } from "./ProviderStatus";
import { VoiceRecordBar } from "./VoiceRecordBar";

export interface GalleryPromptMessage {
  text: string;
}

function selectedPartFaceOrds(
  parts: { id: number; object: { children: readonly unknown[] } }[] | undefined,
  selectedId: number | null,
): { ord: number }[] | undefined {
  if (!parts || selectedId === null) return undefined;
  const part = parts[selectedId];
  if (!part) return undefined;
  const ranges: { ord: number }[] = [];
  for (const child of part.object.children) {
    const geom =
      child && typeof child === "object" && "geometry" in child
        ? (child as { geometry?: { userData?: { faceRanges?: { ord: number }[] } } }).geometry
        : undefined;
    const faceRanges = geom?.userData?.faceRanges;
    if (!Array.isArray(faceRanges)) continue;
    for (const range of faceRanges) {
      if (typeof range?.ord === "number") ranges.push({ ord: range.ord });
    }
  }
  if (ranges.length === 0 || ranges.length > CAD_MENTION_FACE_CAP) return undefined;
  return ranges;
}

function PartMentionRow({ item }: { item: CadMentionItem }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{item.name}</span>
      <span className="truncate text-xs text-muted-foreground">{item.cadRef}</span>
    </span>
  );
}

function ChatInputInner({
  disabled,
  onStop,
  onSubmit,
  placeholder,
  status,
  lockSend,
  attached,
  threadId,
  restorePrompt,
  canStop,
  loadingModel,
  historyMessages,
  sendBlockReason,
  inputRef,
  cancelVoiceRef,
}: {
  disabled: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  placeholder: string;
  status: ChatStatus;
  lockSend: boolean;
  attached: boolean;
  threadId: string;
  restorePrompt: string | null;
  canStop: boolean;
  loadingModel: boolean;
  historyMessages: PromptHistoryMessage[];
  sendBlockReason: string | null;
  inputRef: RefObject<ComposerHandle | null>;
  cancelVoiceRef: MutableRefObject<() => void>;
}) {
  const historyPositionRef = useRef<PromptHistoryPosition | null>(null);
  const { review, selectedId, title } = useStore(
    useShallow((s) => ({
      review: s.review,
      selectedId: s.selectedId,
      title: s.title,
    })),
  );
  const catalogParts = useMemo<CadMentionCatalogPart[]>(
    () =>
      (review?.parts ?? [])
        .filter((part): part is typeof part & { cadRef: string } => Boolean(part.cadRef))
        .map((part) => ({ name: part.name, cadRef: part.cadRef })),
    [review],
  );
  const hasCadParts = catalogParts.length > 0;
  const fileStem = partLabelFileStem(review?.parts.length ?? 0, title);
  const selectedPart = useMemo(() => {
    const selectedRaw = selectedId !== null ? review?.parts[selectedId] : undefined;
    if (selectedRaw?.cadRef == null) return undefined;
    return { name: selectedRaw.name, cadRef: selectedRaw.cadRef };
  }, [review, selectedId]);
  const faces = useMemo(
    () => selectedPartFaceOrds(review?.parts, selectedId),
    [review, selectedId],
  );
  const truncatedRef = useRef(false);
  const mentions = useMemo(
    () => ({
      part: {
        trigger: "#",
        allowSpaces: true,
        queryCloses: cadMentionQueryCloses,
        emptyMessage: hasCadParts ? "No parts match" : "Open a STEP to mention parts",
        getFooter: () => (truncatedRef.current ? "Keep typing to narrow…" : undefined),
        items: (query: string) => {
          const result = filterCadMentionCatalog(catalogParts, query, {
            fileStem,
            selectedPart,
            faces,
          });
          truncatedRef.current = result.truncated;
          return result.items;
        },
        render: (item: CadMentionItem) => <PartMentionRow item={item} />,
      },
    }),
    [catalogParts, faces, fileStem, hasCadParts, selectedPart],
  );
  const mentionTitle = hasCadParts ? "Mention a part (#)" : "Open a STEP to mention parts";
  const voice = useVoiceInput((text) => {
    const cur = inputRef.current?.getText() ?? "";
    const next = !cur.trim() ? text : /[\s\n]$/.test(cur) ? `${cur}${text}` : `${cur} ${text}`;
    inputRef.current?.setText(next);
    inputRef.current?.focus();
  });
  cancelVoiceRef.current = voice.cancel;

  useEffect(() => {
    if (!voice.active) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const layers = {
        ...probeEscLayers(document),
        compactChat: compactChatSheetOpen(document),
        voice: true,
      };
      if (!escBelongsTo("voice", layers)) return;
      e.preventDefault();
      voice.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voice.active, voice.cancel]);

  const draftTouchedRef = useRef(false);
  useEffect(() => {
    const id = threadId;
    draftTouchedRef.current = false;
    return () => {
      if (!inputRef.current?.isReady()) return;
      captureSessionDraft(id, inputRef.current.getText());
    };
  }, [inputRef, threadId]);

  useEffect(() => {
    if (!restorePrompt) return;
    const cur = inputRef.current?.getText() ?? "";
    if (cur.trim()) return;
    inputRef.current?.setText(restorePrompt);
    inputRef.current?.focus();
  }, [restorePrompt]);

  const reason = sendDisabledReason({
    loadingModel,
    lockSend,
    askPlaceholder: placeholder,
    providerReason: sendBlockReason,
  });

  return (
    <div className="w-full">
      <Composer
        canStop={canStop}
        className={attached ? "rounded-none border-0 bg-transparent shadow-none dark:bg-transparent" : "rounded-2xl"}
        defaultValue={getSessionDraft(threadId)}
        disabled={disabled}
        mentionLabelsFor={(text) => mentionLabelsForPrompt(text, catalogParts, fileStem)}
        mentions={mentions}
        onDraftChange={(text) => {
          // Ignore the editor's empty mount update, but store a clear the user made.
          if (text) draftTouchedRef.current = true;
          if (text || draftTouchedRef.current) captureSessionDraft(threadId, text);
        }}
        onPromptHistory={(direction) => {
          const current = inputRef.current?.getText() ?? "";
          const step = stepPromptHistory({
            direction,
            entries: buildPromptHistoryEntries(historyMessages),
            position: historyPositionRef.current,
            currentPrompt: current,
          });
          if (!step) return false;
          historyPositionRef.current = step.position;
          inputRef.current?.setText(step.prompt);
          return true;
        }}
        onStop={onStop}
        onSubmit={(parsed, { clear, focus }) => {
          if (voice.active) return;
          const trimmed = parsed.text.trim();
          if (!trimmed || lockSend || loadingModel || sendBlockReason) return;
          historyPositionRef.current = null;
          setSessionDraft(threadId, "");
          clear();
          focus();
          Promise.resolve(onSubmit({ text: trimmed })).catch(() => undefined);
        }}
        ref={inputRef}
        sendDisabledReason={reason}
        status={status}
      >
      <ComposerEditor
        autoFocus
        className={voice.active ? "invisible pointer-events-none" : undefined}
        placeholder={placeholder}
      />
      <InputGroupAddon
        align="block-end"
        aria-hidden={voice.active}
        className={cn("flex-wrap gap-y-1 pt-1 @[360px]/chat:flex-nowrap", voice.active && "invisible pointer-events-none")}
      >
        <ModelPicker />
        <EffortSelect />
        <ComposerMentionButton
          aria-label="Mention a part (#)"
          disabled={!hasCadParts}
          title={mentionTitle}
          variant="ghost"
        >
          <Hash />
        </ComposerMentionButton>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={lockSend || status === "streaming" || status === "submitted"}
            aria-label="Start voice input"
            title={voice.error ?? "Click to talk"}
            onClick={() => void voice.start()}
          >
            <Mic />
          </Button>
          <ComposerSubmitButton />
        </div>
      </InputGroupAddon>
      {voice.active ? (
        <div className="absolute inset-0 z-10">
          <VoiceRecordBar
            elapsedMs={voice.elapsedMs}
            error={voice.error}
            level={voice.level}
            recording={voice.recording}
            transcribing={voice.busy}
            onCancel={voice.cancel}
            onComplete={voice.complete}
          />
        </div>
      ) : null}
    </Composer>
      {voice.error && !voice.active ? (
        <p className="px-2 pt-1 text-xs text-error">{voice.error}</p>
      ) : null}
    </div>
  );
}

export type GalleryChatHandle = {
  captureDraft: () => void;
  clear: () => void;
  focus: () => void;
  cancelVoice: () => void;
};

export function GalleryChatInput({
  disabled = false,
  onStop,
  onSubmit,
  status,
  pendingAsk = null,
  onAnswerAskUser,
  threadId,
  restorePrompt = null,
  canStop = false,
  loadingModel = false,
  modelLoaded = false,
  historyMessages = [],
  ref,
}: {
  disabled?: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  status: ChatStatus;
  pendingAsk?: { toolCallId: string; input: AskUserQuestionsInput } | null;
  onAnswerAskUser?: (toolCallId: string, output: AskUserQuestionsOutput) => void;
  threadId: string;
  restorePrompt?: string | null;
  canStop?: boolean;
  loadingModel?: boolean;
  modelLoaded?: boolean;
  historyMessages?: PromptHistoryMessage[];
  ref?: Ref<GalleryChatHandle>;
}) {
  const askRef = useRef<AskUserQuestionsHandle>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const cancelVoiceRef = useRef<() => void>(() => {});
  const [activeQuestion, setActiveQuestion] = useState<AskUserQuestion | null>(
    pendingAsk?.input.questions[0] ?? null,
  );
  const attached = Boolean(pendingAsk);
  const lockSend = attached && !activeQuestion?.allowFreeForm;
  const askPlaceholder = attached
    ? askUserComposerPlaceholder(activeQuestion ?? pendingAsk?.input.questions[0])
    : null;
  const prompt = composerPlaceholder({
    askUser: askPlaceholder,
    loadingModel,
    modelLoaded,
  });
  const harness = useStore((s) => s.chatHarness);
  const { harnesses, ready } = useHarnesses();
  const info = harnesses.find((h) => h.id === harness);
  const sendBlockReason = providerSendBlockReason({
    ready,
    label: HARNESS_LABEL[harness],
    status: info?.status,
    detail: info?.detail,
  });

  useImperativeHandle(
    ref,
    () => ({
      captureDraft: () => {
        const handle = composerRef.current;
        if (!handle?.isReady()) return;
        captureSessionDraft(threadId, handle.getText());
      },
      clear: () => {
        setSessionDraft(threadId, "");
        composerRef.current?.clear();
      },
      focus: () => {
        composerRef.current?.focus();
      },
      cancelVoice: () => {
        cancelVoiceRef.current();
      },
    }),
    [threadId],
  );

  return (
    <div className="relative bottom-0 z-10 w-full min-w-0 overflow-x-hidden bg-background pt-2" data-chat-composer>
      <div className="mx-auto w-full min-w-0 p-2 @[360px]/chat:px-4 @[360px]/chat:pb-4">
        <div
          className={cn(
            attached && "overflow-hidden rounded-2xl border border-input shadow-xs dark:bg-input/30",
          )}
        >
          {pendingAsk && onAnswerAskUser ? (
            <AskUserQuestionsPanel
              key={pendingAsk.toolCallId}
              ref={askRef}
              disabled={disabled}
              input={pendingAsk.input}
              onActiveChange={setActiveQuestion}
              onAnswer={(output) => onAnswerAskUser(pendingAsk.toolCallId, output)}
            />
          ) : null}
          <div className={cn(attached && "border-t border-border")}>
            <ChatInputInner
              attached={attached}
              canStop={canStop}
              cancelVoiceRef={cancelVoiceRef}
              disabled={disabled}
              historyMessages={historyMessages}
              inputRef={composerRef}
              loadingModel={loadingModel}
              lockSend={lockSend}
              onStop={onStop}
              onSubmit={(message) => {
                if (pendingAsk) {
                  if (askRef.current?.submitFreeform(message.text)) return;
                  return;
                }
                return onSubmit(message);
              }}
              placeholder={prompt}
              restorePrompt={restorePrompt}
              sendBlockReason={sendBlockReason}
              status={status}
              threadId={threadId}
            />
          </div>
        </div>
        <p className="hidden px-2 pt-1 text-[11px] text-muted-foreground @[360px]/chat:block">{COMPOSER_HINT}</p>
        <ProviderStatus />
      </div>
    </div>
  );
}
