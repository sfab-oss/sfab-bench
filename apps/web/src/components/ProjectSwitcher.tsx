import { Check, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchProject, openTabProject, registerAndOpenTab, type ProjectInfo, type ProjectRow } from "@/lib/project";
import { cn } from "@/lib/utils";

function folderName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function ProjectSwitcher({
  path,
  onBrowse,
  canRegister = true,
}: {
  path: string;
  onBrowse: () => void;
  canRegister?: boolean;
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
      if (canRegister) await registerAndOpenTab(nextPath);
      else openTabProject(nextPath);
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
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-accent"
        title={path}
      >
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{folderName(path)}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{path}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Recent folders
        </div>
        {recents.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No other folders yet.</p>
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
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                      active && "bg-accent/70",
                    )}
                    onClick={() => void switchTo(row.path)}
                  >
                    {active ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                    ) : (
                      <Folder className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{row.name}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{row.path}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error ? <p className="px-2 py-1 text-xs text-destructive">{error}</p> : null}
        {canRegister ? (
          <PopoverClose
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
            onClick={onBrowse}
          >
            <FolderOpen className="size-3.5 text-muted-foreground" />
            Browse folders…
          </PopoverClose>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
