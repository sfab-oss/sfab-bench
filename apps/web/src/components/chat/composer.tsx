import type { ChatStatus } from "ai";
import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  askUserComposerPlaceholder,
  type AskUserQuestion,
  type AskUserQuestionsInput,
  type AskUserQuestionsOutput,
} from "@/chat/ask-user-questions";
import { AskUserQuestionsPanel, type AskUserQuestionsHandle } from "@/components/chat/AskUserQuestionsPanel";
import {
  Composer,
  ComposerEditor,
  type ComposerHandle,
  ComposerSubmitButton,
} from "@/components/ui/composer";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";
import { EffortSelect } from "./EffortSelect";
import { ModelPicker } from "./ModelPicker";
import { ProviderStatus } from "./ProviderStatus";
import { VoiceRecordBar } from "./VoiceRecordBar";

export interface GalleryPromptMessage {
  text: string;
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
        className={cn("pt-1", voice.active && "invisible pointer-events-none")}
      >
        <ModelPicker />
        <EffortSelect />
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
    <div className="relative bottom-0 z-10 w-full bg-background pt-2">
      <div className="mx-auto w-full p-2 @[500px]:px-4 @[500px]:pb-4 md:max-w-3xl @[500px]:md:pb-6">
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
