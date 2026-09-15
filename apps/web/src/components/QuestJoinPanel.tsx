import { Headset } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { QrCode } from "@/components/QrCode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { desktopBridge } from "@/lib/desktop";
import { fetchPairingInfo, rotatePairingInfo, type PairingInfo } from "@/lib/pairing";
import { cn } from "@/lib/utils";

function formatCode(code: string) {
  const compact = code.replace(/\s/g, "");
  return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

function remainingLabel(expiresAt: number, now: number) {
  const s = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CopyFlash = "copied" | "failed" | null;

function copyLabel(state: CopyFlash, idle: string) {
  if (state === "copied") return "Copied";
  if (state === "failed") return "Couldn't copy";
  return idle;
}

export function QuestJoinPanel({
  className,
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [info, setInfo] = useState<PairingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [urlRow, setUrlRow] = useState<CopyFlash>(null);
  const [urlBtn, setUrlBtn] = useState<CopyFlash>(null);
  const [codeBtn, setCodeBtn] = useState<CopyFlash>(null);
  const [qrBtn, setQrBtn] = useState<CopyFlash>(null);
  const copyUrlRef = useRef<HTMLButtonElement>(null);
  const focusedOnOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchPairingInfo()
      .then((next) => {
        if (!cancelled) {
          setInfo(next);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load pairing");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !info) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= info.expiresAt) {
        void fetchPairingInfo()
          .then(setInfo)
          .catch(() => undefined);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [info, open]);

  useEffect(() => {
    if (!open) {
      focusedOnOpen.current = false;
      setUrlRow(null);
      setUrlBtn(null);
      setCodeBtn(null);
      setQrBtn(null);
      return;
    }
    if (focusedOnOpen.current || !copyUrlRef.current) return;
    copyUrlRef.current.focus();
    focusedOnOpen.current = true;
  }, [open, info]);

  useEffect(() => {
    const states = [urlRow, urlBtn, codeBtn, qrBtn];
    if (!states.some(Boolean)) return;
    const id = window.setTimeout(() => {
      setUrlRow(null);
      setUrlBtn(null);
      setCodeBtn(null);
      setQrBtn(null);
    }, 1500);
    return () => window.clearTimeout(id);
  }, [urlRow, urlBtn, codeBtn, qrBtn]);

  const hostLine = desktopBridge() ? "Keep this window on localhost" : "Keep this Mac tab on localhost";

  return (
    <div className={cn(showTrigger ? "pointer-events-auto relative" : "contents", className)}>
      <Dialog open={open} onOpenChange={setOpen}>
        {showTrigger ? (
          <DialogTrigger
            render={
              <Button type="button" size="sm" variant={open ? "secondary" : "default"} className="shadow-lg" />
            }
          >
            <Headset />
            Enter Quest
          </DialogTrigger>
        ) : null}
        <DialogContent className="max-h-[min(32rem,calc(100dvh-2rem))] max-w-sm overflow-y-auto sm:max-w-sm" initialFocus={copyUrlRef}>
          <div className="pr-6">
            <DialogTitle className="pr-0">Enter Quest</DialogTitle>
            <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{hostLine}</p>
          </div>
          {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
          {!error && !info ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}
          {info ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">On Quest Browser open</p>
              <button
                type="button"
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-left font-mono text-sm leading-snug break-all text-foreground hover:bg-accent"
                onClick={() => {
                  if (info.pairUrl) void copy(info.pairUrl).then((ok) => setUrlRow(ok ? "copied" : "failed"));
                }}
              >
                <span className="block">{info.pairUrl ?? "No LAN address. Connect this Mac to Wi-Fi."}</span>
                {urlRow ? <span className="mt-1 block text-xs font-sans tracking-normal">{copyLabel(urlRow, "")}</span> : null}
              </button>
              <p className="mt-3 text-xs text-muted-foreground">then type this code</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div aria-live="polite" className="font-mono text-3xl tracking-[0.2em] text-foreground">
                  {formatCode(info.code)}
                </div>
                <span className="text-xs text-muted-foreground">{remainingLabel(info.expiresAt, now)}</span>
              </div>
              {info.fragmentUrl ? (
                <div className="mt-4 flex items-start gap-3">
                  <QrCode value={info.fragmentUrl} className="h-28 w-28 shrink-0 border border-border" />
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p>Phone: scan the QR. The token stays in the URL fragment so it is less likely to hit logs.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-2"
                      onClick={() => void copy(info.fragmentUrl!).then((ok) => setQrBtn(ok ? "copied" : "failed"))}
                    >
                      {copyLabel(qrBtn, "Copy phone link")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {info.lanUrls.length > 1 ? (
                <p className="mt-3 text-[11px] text-muted-foreground">Other LAN addresses: {info.lanUrls.slice(1).join(", ")}</p>
              ) : null}
            </>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              ref={copyUrlRef}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                if (info?.pairUrl) void copy(info.pairUrl).then((ok) => setUrlBtn(ok ? "copied" : "failed"));
              }}
            >
              {copyLabel(urlBtn, "Copy URL")}
            </Button>
            {info ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy(info.code).then((ok) => setCodeBtn(ok ? "copied" : "failed"))}
                >
                  {copyLabel(codeBtn, "Copy code")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void rotatePairingInfo()
                      .then(setInfo)
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not rotate"));
                  }}
                >
                  New code
                </Button>
              </>
            ) : null}
            <DialogClose render={<Button type="button" size="sm" variant="ghost" />}>Done</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
