import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/settings";
import { cn } from "@/lib/utils";

type CopyFlash = "idle" | "copied" | "failed";

export function CommandBlock({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState<CopyFlash>("idle");
  const timer = useRef<number | null>(null);
  const commandRef = useRef(command);
  commandRef.current = command;

  useEffect(() => {
    setCopied("idle");
    if (timer.current != null) window.clearTimeout(timer.current);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [command]);

  const copy = () => {
    const snapshot = command;
    void copyText(snapshot).then((ok) => {
      if (commandRef.current !== snapshot) return;
      if (timer.current != null) window.clearTimeout(timer.current);
      setCopied(ok ? "copied" : "failed");
      timer.current = window.setTimeout(() => setCopied("idle"), 1500);
    });
  };

  const failed = copied === "failed";
  const done = copied === "copied";
  const label = done ? "Copied" : failed ? "Copy failed" : "Copy";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate" title={command}>
        <span className="mr-1.5 text-muted-foreground">$</span>
        {command}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 gap-1 px-1.5 text-xs"
        aria-label={done ? "Copied" : failed ? "Copy failed" : "Copy command"}
        title={label}
        onClick={copy}
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
        {label}
      </Button>
    </div>
  );
}
