import { firmwareChip } from "@sfab-bench/contract";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { jsonApi } from "@/lib/api";
import { syncDeviceQuery } from "@/lib/device-query";

function errorText(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  return typeof error === "string" ? error : null;
}

function serialPage(body: unknown): { text: string; next: number } | null {
  if (!body || typeof body !== "object") return null;
  if (!("text" in body) || !("next" in body)) return null;
  const text = (body as { text: unknown }).text;
  const next = (body as { next: unknown }).next;
  if (typeof text !== "string" || typeof next !== "number") return null;
  return { text, next };
}

/**
 * Desktop serial log for the tab's `?device=`. The viewport stays above this.
 * Quest does not mount it.
 */
export function SerialConsole({ path }: { path: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const scroller = useRef<HTMLPreElement>(null);
  const chip = firmwareChip(path);

  useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    let opening = false;
    let hold = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const pull = async () => {
      const res = await jsonApi.device.serial.$post({
        json: { path, from: cursor },
      });
      const body: unknown = await res.json();
      if (cancelled) return;
      const failed = errorText(body);
      if (failed === "device is not running") {
        if (opening || hold) return;
        opening = true;
        try {
          const opened = await jsonApi.device.open.$post({ json: { path } });
          const openedBody: unknown = await opened.json();
          if (cancelled) return;
          const openFailed = errorText(openedBody);
          if (openFailed) {
            hold = true;
            setError(openFailed);
            return;
          }
          cursor = 0;
          setText("");
          setError(null);
        } finally {
          opening = false;
        }
        return;
      }
      if (failed) {
        setError(failed);
        return;
      }
      const page = serialPage(body);
      if (!page) return;
      setError(null);
      if (page.text) {
        setText((prev) => prev + page.text);
        cursor = page.next;
      }
    };
    void (async () => {
      const opened = await jsonApi.device.open.$post({ json: { path } });
      const body: unknown = await opened.json();
      if (cancelled) return;
      const failed = errorText(body);
      if (failed) {
        setError(failed);
        return;
      }
      await pull();
      timer = setInterval(() => void pull(), 250);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [path]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <section className="flex h-44 shrink-0 flex-col border-t border-border bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium" title={path}>
          {path}
          {chip ? ` · ${chip}` : ""}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => syncDeviceQuery("")}
        >
          Close
        </button>
      </div>
      <pre
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground"
      >
        {text || (error ? "" : "Starting the emulator…")}
      </pre>
      {error ? (
        <p className="shrink-0 px-3 pb-1 text-xs text-error">{error}</p>
      ) : null}
      <form
        className="flex shrink-0 gap-2 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = line;
          if (!next || error) return;
          setLine("");
          void jsonApi.device.input.$post({ json: { path, text: next } });
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="Serial input"
          value={line}
          placeholder="Send a line"
          disabled={error !== null}
          onChange={(event) => setLine(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={error !== null}
        >
          Send
        </Button>
      </form>
    </section>
  );
}
