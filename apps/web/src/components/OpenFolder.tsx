import { useCallback, useEffect, useState } from "react";
import { Folder } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { desktopBridge } from "@/lib/desktop";
import {
  browsePath,
  fetchProject,
  folderName,
  openTabProject,
  registerAndOpenTab,
  shortPath,
  type BrowseInfo,
  type ProjectRow,
} from "@/lib/project";

export function RecentFolders({
  recents,
  busy,
  onPick,
}: {
  recents: ProjectRow[];
  busy?: boolean;
  onPick: (path: string) => void;
}) {
  if (recents.length === 0) return null;
  return (
    <ul className="w-full text-left">
      {recents.map((row) => (
        <li key={row.path}>
          <button
            type="button"
            disabled={busy}
            className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
            onClick={() => onPick(row.path)}
          >
            <span className="text-sm text-foreground">{row.name}</span>
            <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{shortPath(row.path)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function useOpenFolder(canRegister: boolean) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recents, setRecents] = useState<ProjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void fetchProject()
      .then((info) => {
        setRecents(info.recents);
        setError(null);
      })
      .catch((err: unknown) => {
        setRecents([]);
        setError(err instanceof Error ? err.message : "Could not load folders");
      });
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("sfab-project", reload);
    return () => window.removeEventListener("sfab-project", reload);
  }, [reload]);

  const pickRecent = useCallback(
    (path: string) => {
      if (canRegister) void registerAndOpenTab(path);
      else openTabProject(path);
    },
    [canRegister],
  );

  const requestOpen = useCallback(async () => {
    if (!canRegister) return;
    const bridge = desktopBridge();
    if (bridge) {
      try {
        const picked = await bridge.pickFolder();
        if (picked) await registerAndOpenTab(picked);
      } catch {
        setError("Could not open the folder chooser");
      }
      return;
    }
    setDialogOpen(true);
  }, [canRegister]);

  return { canRegister, recents, error, dialogOpen, setDialogOpen, requestOpen, pickRecent };
}

export type OpenFolderApi = ReturnType<typeof useOpenFolder>;

export function BrowseFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [browse, setBrowse] = useState<BrowseInfo | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void fetchProject()
      .then(async (info) => {
        const start = info.project?.path ?? "";
        const listing = await browsePath(start || undefined);
        if (cancelled) return;
        setBrowse(listing);
        setPath(listing.path);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not browse");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const go = async (next: string) => {
    const value = next.trim();
    if (!value) return;
    setError(null);
    try {
      const listing = await browsePath(value);
      setBrowse(listing);
      setPath(listing.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that path");
    }
  };

  const openHere = async () => {
    const value = path.trim() || browse?.path?.trim() || "";
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerAndOpenTab(value);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Open folder</DialogTitle>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void go(path);
          }}
        >
          <Input
            value={path}
            onChange={(ev) => setPath(ev.target.value)}
            placeholder="~/Projects/my-cad"
            className="h-8 flex-1 font-mono text-[12px]"
            disabled={busy}
            aria-label="Folder path"
          />
          <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy || !path.trim()}>
            Go
          </Button>
        </form>
        {browse ? (
          <div className="mt-3 min-h-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={!browse.parent || busy}
                onClick={() => {
                  if (!browse.parent) return;
                  void go(browse.parent);
                }}
              >
                Up
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={browse.path}>
                {shortPath(browse.path)}
              </span>
            </div>
            <ul className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
              {browse.dirs.length === 0 ? (
                <li className="px-2 py-2 text-[13px] text-muted-foreground">No folders here.</li>
              ) : (
                browse.dirs.map((dir) => (
                  <li key={dir.path}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 truncate px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => void go(dir.path)}
                    >
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      {dir.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" className="h-8" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-8" disabled={busy || !(path.trim() || browse?.path)} onClick={() => void openHere()}>
            Open
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WelcomeFolders({ folder }: { folder: OpenFolderApi }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        {folder.canRegister
          ? "Open a folder to start."
          : "Pick a folder the Mac has opened. Opening a new path is Mac-only."}
      </p>
      {folder.canRegister ? (
        <Button type="button" size="sm" onClick={() => void folder.requestOpen()}>
          <Folder className="size-3.5" />
          Open folder
        </Button>
      ) : null}
      {folder.recents.length > 0 ? (
        <div className="w-full">
          <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent</p>
          <RecentFolders recents={folder.recents} onPick={folder.pickRecent} />
        </div>
      ) : null}
      {!folder.canRegister && folder.recents.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Open a folder on the Mac first, then it shows up here.</p>
      ) : null}
      {folder.error ? <p className="text-xs text-destructive">{folder.error}</p> : null}
    </div>
  );
}

export function EmptyFolderRail({ folder }: { folder: OpenFolderApi }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[13px] text-muted-foreground">
        {folder.canRegister ? "Open a folder to see its files." : "Pick a folder the Mac has opened."}
      </p>
      {folder.canRegister ? (
        <Button type="button" size="sm" className="h-8" onClick={() => void folder.requestOpen()}>
          <Folder className="size-3.5" />
          Open folder
        </Button>
      ) : null}
      <RecentFolders recents={folder.recents} onPick={folder.pickRecent} />
      {!folder.canRegister && folder.recents.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Open a folder on the Mac first, then it shows up here.</p>
      ) : null}
    </div>
  );
}

export function WelcomeFiles({
  recents,
  hasCad,
  ready,
  onPick,
}: {
  recents: string[];
  hasCad: boolean;
  ready: boolean;
  onPick: (path: string) => void;
}) {
  if (ready && !hasCad) {
    return <p className="text-sm text-muted-foreground">This folder has no STEP or GLB.</p>;
  }
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">Open a STEP or GLB to view it.</p>
      {recents.length > 0 ? (
        <div className="w-full">
          <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent</p>
          <ul className="w-full text-left">
            {recents.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => onPick(path)}
                >
                  <span className="text-sm text-foreground">{folderName(path)}</span>
                  <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

