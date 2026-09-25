import type { WorldBoardState } from "@sfab-bench/contract";
import { useEffect, useState } from "react";

import { projectFileUrl } from "@/cad/loadCadReview";
import { SerialConsole } from "@/components/SerialConsole";
import { SourceView } from "@/components/SourceView";
import { Button } from "@/components/ui/button";
import { sendBoardSerial } from "@/hooks/useWorldRun";
import { apiFetch } from "@/lib/api";
import { relFromWorldFile } from "@/lib/world-assets";
import { type BoardConsoleEntry, useBoardConsole } from "@/state/board-console";
import { useWorld } from "@/state/world";

type BoardMeta = { id: string; source?: string };

function transcriptText(entries: readonly BoardConsoleEntry[]): string {
  let text = "";
  for (const entry of entries) {
    if (entry.kind === "out") {
      text += entry.text;
      continue;
    }
    const line = entry.text.endsWith("\n") ? entry.text : `${entry.text}\n`;
    text += `‹ sent by ${entry.by} › ${line}`;
  }
  return text;
}

/**
 * Collapsible desktop console for the open world's boards. Self-contained
 * so a later inspector can replace it. Not mounted in XR.
 */
export function BoardPanel() {
  const path = useWorld((s) => s.path);
  const revision = useWorld((s) => s.revision);
  const boards = useWorld((s) => s.boards);
  const consoleState = useBoardConsole();
  const [open, setOpen] = useState(true);
  const [sourceOn, setSourceOn] = useState(false);
  const [metas, setMetas] = useState<BoardMeta[]>([]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!path) {
      setMetas([]);
      return;
    }
    let cancelled = false;
    void apiFetch(projectFileUrl(path), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { boards?: unknown };
      })
      .then((doc) => {
        if (cancelled) return;
        const list = doc && Array.isArray(doc.boards) ? doc.boards : [];
        const metas: BoardMeta[] = [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const id = (item as { id?: unknown }).id;
          const source = (item as { source?: unknown }).source;
          if (typeof id !== "string") continue;
          metas.push(typeof source === "string" ? { id, source } : { id });
        }
        setMetas(metas);
      })
      .catch(() => {
        if (!cancelled) setMetas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  const ids = [
    ...new Set([
      ...metas.map((item) => item.id),
      ...Object.keys(boards),
      ...Object.keys(consoleState.boards),
    ]),
  ];
  const selected = ids.includes(picked) ? picked : (ids[0] ?? "");
  const meta = metas.find((item) => item.id === selected);
  const sourceRel =
    path && meta?.source ? relFromWorldFile(path, meta.source) : undefined;
  const live: WorldBoardState | undefined = boards[selected];
  const text = transcriptText(consoleState.boards[selected]?.entries ?? []);

  if (!path || ids.length === 0) return null;

  return (
    <section className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex max-h-64 flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        {ids.length > 1 ? (
          <select
            className="max-w-40 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs"
            aria-label="Board"
            value={selected}
            onChange={(event) => setPicked(event.target.value)}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate px-1 font-medium" title={selected}>
            {selected}
          </span>
        )}
        <span className="text-muted-foreground">
          {live?.fault ? "stopped" : live?.running ? "running" : ""}
        </span>
        <span className="min-w-0 flex-1" />
        <Button
          type="button"
          size="sm"
          variant={sourceOn ? "secondary" : "ghost"}
          className="h-6 px-2 text-xs"
          onClick={() => setSourceOn((value) => !value)}
        >
          Source
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Console"}
        </Button>
      </div>
      {open ? (
        <div className="flex min-h-36 flex-1 flex-col">
          {sourceOn ? (
            sourceRel ? (
              <SourceView path={sourceRel} />
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                This board has no source file.
              </p>
            )
          ) : (
            <SerialConsole
              title={selected}
              text={text}
              fault={live?.fault}
              onSend={(line) => sendBoardSerial(selected, line)}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
