import { Check, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchProject, openProjectPath, type ProjectInfo, type ProjectRow } from "@/lib/project";
import { cn } from "@/lib/utils";

function folderName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function ProjectSwitcher({
  path,
  onBrowse,
}: {
  path: string;
  onBrowse: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void fetchProject()
      .then((next) => {
        setInfo(next);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load folders");
      });
  };

  const switchTo = async (nextPath: string) => {
    if (busy || nextPath === path) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openProjectPath(nextPath);
      window.dispatchEvent(new Event("sfab-project"));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that folder");
    } finally {
      setBusy(false);
    }
  };

  const recents: ProjectRow[] = info?.recents ?? [];

  useEffect(() => {
    load();
  }, [path]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-zinc-100"
        title={path}
      >
        <Folder className="size-4 shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-900">{folderName(path)}</span>
          <span className="block truncate font-mono text-[11px] text-zinc-400">{path}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
          Recent folders
        </div>
        {recents.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-zinc-500">No other folders yet.</p>
        ) : (
          <ul>
            {recents.map((row) => {
              const active = row.path === path;
              return (
                <li key={row.path}>
                  <button
                    type="button"
                    disabled={busy}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100",
                      active && "bg-zinc-50",
                    )}
                    onClick={() => void switchTo(row.path)}
                  >
                    {active ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-zinc-700" />
                    ) : (
                      <Folder className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-800">{row.name}</span>
                      <span className="block truncate font-mono text-[11px] text-zinc-400">{row.path}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error ? <p className="px-2 py-1 text-xs text-red-600">{error}</p> : null}
        <PopoverClose
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100"
          onClick={onBrowse}
        >
          <FolderOpen className="size-3.5 text-zinc-400" />
          Browse folders…
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}
