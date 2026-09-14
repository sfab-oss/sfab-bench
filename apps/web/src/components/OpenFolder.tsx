import { Folder } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desktopBridge } from "@/lib/desktop";
import { browsePath, fetchProject, openProjectPath, type BrowseInfo, type ProjectInfo } from "@/lib/project";

export function OpenFolderForm({
  onOpened,
}: {
  onOpened?: () => void;
}) {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [browse, setBrowse] = useState<BrowseInfo | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bridge = desktopBridge();

  useEffect(() => {
    let cancelled = false;
    void fetchProject()
      .then(async (next) => {
        if (cancelled) return;
        setInfo(next);
        setPath(next.project?.path ?? "");
        try {
          const listing = await browsePath(next.project?.path);
          if (!cancelled) setBrowse(listing);
        } catch {
          /* typed path is enough */
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load folders");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <p className="text-[13px] text-muted-foreground">
        A project is a folder on this Mac. STEP and GLB files inside it show up as documents.
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
              .then((picked) => (picked ? submit(picked) : undefined))
              .catch(() => setError("Could not open the folder chooser"));
          }}
        >
          <Folder className="size-3.5" />
          Choose folder…
        </Button>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit(path);
        }}
      >
        <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {bridge ? "Or type a path" : "Path"}
        </label>
        <Input
          value={path}
          onChange={(ev) => setPath(ev.target.value)}
          placeholder="~/Projects/my-cad"
          className="h-8 font-mono text-[12px]"
          disabled={busy}
        />
        <Button type="submit" size="sm" className="h-8" disabled={busy || !path.trim()}>
          Open folder
        </Button>
      </form>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {info?.recents?.length ? (
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent</p>
          <ul className="mt-1">
            {info.recents.map((row) => (
              <li key={row.path}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => void submit(row.path)}
                >
                  <span className="text-sm text-foreground">{row.name}</span>
                  <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{row.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {browse ? (
        <div className="min-h-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Browse</p>
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
            onClick={() => void submit(browse.path)}
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
      ) : null}
    </div>
  );
}
