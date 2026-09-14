import { Folder } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { desktopBridge } from "@/lib/desktop";
import {
  browsePath,
  fetchProject,
  openTabProject,
  registerAndOpenTab,
  type BrowseInfo,
  type ProjectInfo,
  type ProjectRow,
} from "@/lib/project";

function RecentList({
  recents,
  busy,
  onPick,
}: {
  recents: ProjectRow[];
  busy: boolean;
  onPick: (path: string) => void;
}) {
  if (recents.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent</p>
      <ul className="mt-1">
        {recents.map((row) => (
          <li key={row.path}>
            <button
              type="button"
              disabled={busy}
              className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
              onClick={() => onPick(row.path)}
            >
              <span className="text-sm text-foreground">{row.name}</span>
              <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{row.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OpenFolderForm({
  onOpened,
  canRegister = true,
}: {
  onOpened?: () => void;
  canRegister?: boolean;
}) {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [browse, setBrowse] = useState<BrowseInfo | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bridge = canRegister ? desktopBridge() : null;

  useEffect(() => {
    let cancelled = false;
    void fetchProject()
      .then(async (next) => {
        if (cancelled) return;
        setInfo(next);
        const start = next.project?.path ?? "";
        setPath(start);
        if (!canRegister) return;
        try {
          const listing = await browsePath(start || undefined);
          if (!cancelled) setBrowse(listing);
        } catch {
          /* recents are enough */
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load folders");
      });
    return () => {
      cancelled = true;
    };
  }, [canRegister]);

  const pick = async (nextPath: string, register: boolean) => {
    const value = nextPath.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (register) await registerAndOpenTab(value);
      else openTabProject(value);
      onOpened?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that folder");
    } finally {
      setBusy(false);
    }
  };

  const recents = info?.recents ?? [];
  const diskBrowser =
    canRegister && browse ? (
      <div className="min-h-0 flex-1">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">This Mac</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={!browse.parent}
            onClick={() => {
              if (!browse.parent) return;
              void browsePath(browse.parent).then(setBrowse);
            }}
          >
            Up
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{browse.path}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-7 w-full"
          disabled={busy}
          onClick={() => void pick(browse.path, true)}
        >
          <Folder className="size-3.5" />
          Open this folder
        </Button>
        <ul className="mt-1 max-h-56 overflow-auto">
          {browse.dirs.map((dir) => (
            <li key={dir.path}>
              <button
                type="button"
                className="flex w-full items-center gap-2 truncate rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-accent"
                onClick={() => {
                  setPath(dir.path);
                  void browsePath(dir.path).then(setBrowse);
                }}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                {dir.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <p className="text-[13px] text-muted-foreground">
        {canRegister
          ? "A project is a folder on this Mac. Pick a recent, or choose one."
          : "Pick a folder the Mac has opened. Opening a new path is Mac-only."}
      </p>
      {bridge ? (
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={() => {
            void bridge
              .pickFolder()
              .then((picked) => (picked ? pick(picked, true) : undefined))
              .catch(() => setError("Could not open the folder chooser"));
          }}
        >
          <Folder className="size-3.5" />
          Choose folder…
        </Button>
      ) : null}
      <RecentList recents={recents} busy={busy} onPick={(next) => void pick(next, canRegister)} />
      {recents.length === 0 && !canRegister ? (
        <p className="text-[13px] text-muted-foreground">Open a folder on the Mac first, then it shows up here.</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {diskBrowser && recents.length === 0 ? diskBrowser : null}
      {diskBrowser && recents.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-[11px] text-muted-foreground hover:text-foreground">
            Browse this Mac
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">{diskBrowser}</CollapsibleContent>
        </Collapsible>
      ) : null}
      {canRegister ? (
        <Collapsible>
          <CollapsibleTrigger className="text-[11px] text-muted-foreground hover:text-foreground">
            Paste a path
          </CollapsibleTrigger>
          <CollapsibleContent>
            <form
              className="mt-2 flex flex-col gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                void pick(path, true);
              }}
            >
              <Input
                value={path}
                onChange={(ev) => setPath(ev.target.value)}
                placeholder="~/Projects/my-cad"
                className="h-8 font-mono text-[12px]"
                disabled={busy}
              />
              <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy || !path.trim()}>
                Open
              </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
