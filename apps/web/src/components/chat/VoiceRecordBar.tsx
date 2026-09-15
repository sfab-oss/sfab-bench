import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatVoiceTime } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

function Wave({ level, frozen, elapsedMs }: { level: number; frozen?: boolean; elapsedMs: number }) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => {
        const phase = Math.abs(Math.sin(i * 0.7 + (frozen ? 0 : elapsedMs / 180)));
        const h = frozen ? 6 : 4 + (6 + level * 18) * phase;
        return (
          <span
            key={i}
            className={cn("w-[2px] rounded-full", frozen ? "bg-muted-foreground/40" : "bg-destructive")}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export function VoiceRecordBar({
  recording,
  transcribing,
  elapsedMs,
  level,
  error,
  onCancel,
  onComplete,
}: {
  recording: boolean;
  transcribing: boolean;
  elapsedMs: number;
  level: number;
  error?: string | null;
  onCancel: () => void;
  onComplete: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-16 w-full items-center gap-1 px-2"
      role="status"
      aria-live="polite"
      aria-label={transcribing ? "Transcribing" : `Recording ${formatVoiceTime(elapsedMs)}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Cancel recording"
        title="Cancel"
        onClick={onCancel}
      >
        <X />
      </Button>
      <Wave elapsedMs={elapsedMs} frozen={transcribing} level={level} />
      <span className="w-10 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {transcribing ? "…" : formatVoiceTime(elapsedMs)}
      </span>
      <Button
        type="button"
        variant="default"
        size="icon-sm"
        disabled={transcribing || !recording}
        aria-label="Done recording"
        title={error ?? (transcribing ? "Transcribing…" : "Done")}
        onClick={onComplete}
      >
        {transcribing ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
    </div>
  );
}
