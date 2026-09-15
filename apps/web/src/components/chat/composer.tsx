import type { ChatStatus } from "ai";
import { Hash, Mic } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { partLabelFileStem } from "@/lib/part-label";
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
}: {
  disabled: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  placeholder: string;
  status: ChatStatus;
  lockSend: boolean;
  attached: boolean;
}) {
  const inputRef = useRef<ComposerHandle>(null);
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

  useEffect(() => {
    if (!voice.active) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        voice.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voice.active, voice.cancel]);

  return (
    <div className="w-full">
      <Composer
        className={attached ? "rounded-none border-0 bg-transparent shadow-none dark:bg-transparent" : "rounded-2xl"}
        disabled={disabled}
        mentions={mentions}
        onStop={onStop}
        onSubmit={(parsed, { clear }) => {
          if (voice.active) return;
          const trimmed = parsed.text.trim();
          if (!trimmed || lockSend) return;
          clear();
          Promise.resolve(onSubmit({ text: trimmed })).catch(() => undefined);
        }}
        ref={inputRef}
        status={status}
      >
      <ComposerEditor
        className={voice.active ? "invisible pointer-events-none" : undefined}
        placeholder={placeholder}
      />
      <InputGroupAddon
        align="block-end"
        aria-hidden={voice.active}
        className={cn("flex-wrap gap-y-1 pt-1", voice.active && "invisible pointer-events-none")}
      >
        <ModelPicker />
        <EffortSelect />
        <ComposerMentionButton
          aria-label="Mention a part (#)"
          disabled={disabled || !hasCadParts}
          title={mentionTitle}
          variant="ghost"
        >
          <Hash />
        </ComposerMentionButton>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled || lockSend || status === "streaming" || status === "submitted"}
            aria-label="Start voice input"
            title={voice.error ?? "Tap to talk"}
            onClick={() => void voice.start()}
          >
            <Mic />
          </Button>
          <ComposerSubmitButton disabled={lockSend} />
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
        <p className="px-2 pt-1 text-xs text-destructive">{voice.error}</p>
      ) : null}
    </div>
  );
}

export function GalleryChatInput({
  disabled = false,
  onStop,
  onSubmit,
  placeholder = "Ask anything...",
  status,
  pendingAsk = null,
  onAnswerAskUser,
}: {
  disabled?: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  placeholder?: string;
  status: ChatStatus;
  pendingAsk?: { toolCallId: string; input: AskUserQuestionsInput } | null;
  onAnswerAskUser?: (toolCallId: string, output: AskUserQuestionsOutput) => void;
}) {
  const askRef = useRef<AskUserQuestionsHandle>(null);
  const [activeQuestion, setActiveQuestion] = useState<AskUserQuestion | null>(
    pendingAsk?.input.questions[0] ?? null,
  );
  const attached = Boolean(pendingAsk);
  const lockSend = attached && !activeQuestion?.allowFreeForm;
  const prompt = attached ? askUserComposerPlaceholder(activeQuestion ?? pendingAsk?.input.questions[0]) : placeholder;

  return (
    <div className="relative bottom-0 z-10 w-full min-w-0 overflow-x-hidden bg-background pt-2" data-chat-composer>
      <div className="mx-auto w-full min-w-0 p-2 @[360px]:px-4 @[360px]:pb-4 md:max-w-3xl @[500px]:md:pb-6">
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
              disabled={disabled}
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
              status={status}
            />
          </div>
        </div>
        <ProviderStatus />
      </div>
    </div>
  );
}
