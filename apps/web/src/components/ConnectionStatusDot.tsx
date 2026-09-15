import { connectionDotLabel, connectionDotVisible, type ConnectionPhase } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ConnectionStatusDot({
  phase,
  offerReload,
}: {
  phase: ConnectionPhase;
  offerReload: boolean;
}) {
  const label = connectionDotLabel(phase, offerReload);
  const visible = connectionDotVisible(phase);
  const ping = phase === "reconnecting";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span
        title={label}
        aria-label={label}
        role="status"
        className={cn(
          "relative flex size-4 items-center justify-center",
          !visible && "opacity-40",
        )}
      >
        {ping ? (
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-muted-foreground/60" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            phase === "offline" ? "bg-destructive" : visible ? "bg-muted-foreground" : "bg-muted-foreground/50",
          )}
        />
      </span>
      {offerReload ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-xs"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      ) : null}
    </div>
  );
}
