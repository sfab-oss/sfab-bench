import { Headset } from "lucide-react";
import { useEffect, useState } from "react";

import { QrCode } from "@/components/QrCode";
import { Button } from "@/components/ui/button";
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

export function QuestJoinPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PairingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);

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
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const markCopied = (key: string) => setCopied(key);

  return (
    <div className={cn("pointer-events-auto relative", className)}>
      <Button
        type="button"
        size="sm"
        variant={open ? "secondary" : "default"}
        className="shadow-lg"
        onClick={() => setOpen((value) => !value)}
      >
        <Headset />
        Enter Quest
      </Button>
      {open ? (
        <div className="fixed top-24 right-4 left-4 z-40 w-auto rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl sm:top-16 sm:left-auto sm:w-[22rem]">
          <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Keep this Mac tab on localhost</p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {!error && !info ? <p className="mt-3 text-sm text-zinc-500">Loading…</p> : null}
          {info ? (
            <>
              <p className="mt-3 text-xs text-zinc-500">On Quest Browser open</p>
              <button
                type="button"
                className="mt-1 w-full rounded-lg bg-zinc-50 px-3 py-2 text-left font-mono text-sm leading-snug break-all text-zinc-900 hover:bg-zinc-100"
                onClick={() => {
                  if (info.pairUrl) void copy(info.pairUrl).then((ok) => ok && markCopied("url"));
                }}
              >
                {info.pairUrl ?? "No LAN address. Connect this Mac to Wi-Fi."}
              </button>
              <p className="mt-3 text-xs text-zinc-500">then type this code</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="font-mono text-3xl tracking-[0.2em] text-zinc-900">{formatCode(info.code)}</div>
                <span className="text-xs text-zinc-400">{remainingLabel(info.expiresAt, now)}</span>
              </div>
              {info.fragmentUrl ? (
                <div className="mt-4 flex items-start gap-3">
                  <QrCode value={info.fragmentUrl} className="h-28 w-28 shrink-0 border border-zinc-200" />
                  <div className="min-w-0 text-xs text-zinc-500">
                    <p>Phone: scan the QR. The token stays in the URL fragment so it is less likely to hit logs.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-2"
                      onClick={() => void copy(info.fragmentUrl!).then((ok) => ok && markCopied("qr"))}
                    >
                      {copied === "qr" ? "Copied" : "Copy phone link"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (info.pairUrl) void copy(info.pairUrl).then((ok) => ok && markCopied("url"));
                  }}
                >
                  {copied === "url" ? "Copied" : "Copy URL"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy(info.code).then((ok) => ok && markCopied("code"))}
                >
                  {copied === "code" ? "Copied" : "Copy code"}
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
              </div>
              {info.lanUrls.length > 1 ? (
                <p className="mt-3 text-[11px] text-zinc-400">Other LAN addresses: {info.lanUrls.slice(1).join(", ")}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
