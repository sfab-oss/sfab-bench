import type { ChatStatus } from "ai";
import { Mic } from "lucide-react";
import { useEffect, useRef } from "react";
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
}: {
  disabled: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  placeholder: string;
  status: ChatStatus;
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
        className="rounded-2xl"
        disabled={disabled}
        onStop={onStop}
        onSubmit={(parsed, { clear }) => {
          if (voice.active) return;
          const trimmed = parsed.text.trim();
          if (!trimmed) return;
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
              disabled={disabled || status === "streaming" || status === "submitted"}
              aria-label="Start voice input"
              title={voice.error ?? "Tap to talk"}
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
      <ProviderStatus />
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
}: {
  disabled?: boolean;
  onStop?: () => void;
  onSubmit: (message: GalleryPromptMessage) => void | Promise<void>;
  placeholder?: string;
  status: ChatStatus;
}) {
  return (
    <div className="relative bottom-0 z-10 w-full bg-background pt-2">
      <div className="mx-auto w-full p-2 @[500px]:px-4 @[500px]:pb-4 md:max-w-3xl @[500px]:md:pb-6">
        <ChatInputInner
          disabled={disabled}
          onStop={onStop}
          onSubmit={onSubmit}
          placeholder={placeholder}
          status={status}
        />
      </div>
    </div>
  );
}
