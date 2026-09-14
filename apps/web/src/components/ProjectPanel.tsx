import { Folder } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { browsePath, fetchProject, openProjectPath, type BrowseInfo, type ProjectInfo } from "@/lib/project";
import { cn } from "@/lib/utils";

export function ProjectPanel({ className, onOpened }: { className?: string; onOpened?: () => void }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [browse, setBrowse] = useState<BrowseInfo | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProject()
      .then((next) => {
        if (cancelled) return;
        setInfo(next);
        setPath(next.project?.path ?? "");
      })
      .catch(() => {
        /* host-only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchProject()
      .then(async (next) => {
        if (cancelled) return;
        setInfo(next);
        setPath(next.project?.path ?? "");
        setError(null);
        try {
          const listing = await browsePath(next.project?.path);
          if (!cancelled) setBrowse(listing);
        } catch {
          /* typed path is enough */
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load project");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async (nextPath: string) => {
    const value = nextPath.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await openProjectPath(value);
      setInfo(next);
      setPath(next.project?.path ?? value);
      window.dispatchEvent(new Event("sfab-project"));
      onOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("pointer-events-auto relative", className)}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={open ? "h-9 bg-zinc-200 shadow-lg" : "h-9 shadow-lg"}
        title="Open project"
        onClick={() => setOpen((v) => !v)}
      >
        <Folder />
        {info?.project?.name ?? "Open folder"}
      </Button>
      {open ? (
        <div className="absolute top-12 right-0 z-30 w-[22rem] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Open a folder</p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void submit(path);
            }}
          >
            <Input
              value={path}
              onChange={(ev) => setPath(ev.target.value)}
              placeholder="~/Projects/my-cad"
              className="h-8 font-mono text-[12px]"
              disabled={busy}
            />
            <Button type="submit" size="sm" className="h-8 shrink-0" disabled={busy}>
              Open
            </Button>
          </form>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          {info?.recents?.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Recent</p>
              <ul className="mt-1">
                {info.recents.map((row) => (
                  <li key={row.path}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start rounded-md px-2 py-1 text-left hover:bg-zinc-100"
                      onClick={() => void submit(row.path)}
                    >
                      <span className="text-sm text-zinc-800">{row.name}</span>
                      <span className="w-full truncate font-mono text-[11px] text-zinc-400">{row.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {browse ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Browse</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] text-zinc-500 hover:text-zinc-800"
                  disabled={!browse.parent}
                  onClick={() => {
                    if (!browse.parent) return;
                    void browsePath(browse.parent).then(setBrowse);
                  }}
                >
                  Up
                </button>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400">{browse.path}</span>
              </div>
              <ul className="mt-1 max-h-40 overflow-auto">
                {browse.dirs.map((dir) => (
                  <li key={dir.path}>
                    <button
                      type="button"
                      className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      onClick={() => {
                        setPath(dir.path);
                        void browsePath(dir.path).then(setBrowse);
                      }}
                      onDoubleClick={() => void submit(dir.path)}
                    >
                      {dir.name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-zinc-400">Double-click a folder to open it.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
