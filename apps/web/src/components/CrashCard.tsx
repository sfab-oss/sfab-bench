import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { crashCardReason, formatCrashReport } from "@/lib/crash-report";
import { projectUrl } from "@/lib/project-query";
import { cn } from "@/lib/utils";

export function CrashCard({
  error,
  onRetry,
  variant = "card",
}: {
  error: unknown;
  onRetry?: () => void;
  variant?: "card" | "page";
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);
  const projectPath = projectUrl();
  const reason = crashCardReason(error, projectPath);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const copyReport = () => {
    const report = formatCrashReport({
      pathname: typeof window === "undefined" ? "/" : window.location.pathname,
      time: new Date().toISOString(),
      error,
      projectPath,
    });
    void navigator.clipboard.writeText(report).then(
      () => {
        setCopied(true);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* private mode / permission */
      }
    );
  };

  const card = (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-destructive bg-card p-4 text-sm shadow-lg",
        variant === "page" ? "w-full max-w-md" : "w-80"
      )}
    >
      <strong>Something went wrong</strong>
      <p
        className="mt-1 line-clamp-2 break-words text-muted-foreground"
        title={reason}
      >
        {reason}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry ? (
          <Button type="button" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copyReport}>
          {copied ? "Copied" : "Copy report"}
        </Button>
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="grid h-dvh place-items-center bg-studio px-4">{card}</div>
    );
  }
  return card;
}
