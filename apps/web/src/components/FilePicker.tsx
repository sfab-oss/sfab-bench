import { Button } from "@/components/ui/button";
import {
  catalogFolder,
  catalogKindLabel,
  catalogLabel,
  catalogSections,
  type CatalogEntry,
} from "@/lib/viewer-snapshot";
import { cn } from "@/lib/utils";

function Row({
  entry,
  current,
  onPick,
}: {
  entry: CatalogEntry;
  current: string;
  onPick: (path: string) => void;
}) {
  const folder = catalogFolder(entry.path);
  const kind = catalogKindLabel(entry.kind);
  const sub = folder ? `${folder} · ${kind}` : kind;
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-auto w-full flex-col items-start justify-start rounded-sm px-2 py-1.5 text-left font-normal",
        entry.path === current ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600",
      )}
      onClick={() => onPick(entry.path)}
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{catalogLabel(entry.path)}</span>
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-px text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
          {kind}
        </span>
      </span>
      <span className="w-full truncate text-[11px] font-normal text-zinc-400">{sub}</span>
    </Button>
  );
}

export function FilePickerList({
  files,
  recents = [],
  current,
  error,
  ready,
  onPick,
}: {
  files: CatalogEntry[];
  recents?: string[];
  current: string;
  error?: string | null;
  ready?: boolean;
  onPick: (path: string) => void;
}) {
  const { recents: recentRows, rest } = catalogSections(files, recents);
  if (error) {
    return <div className="px-2 py-1.5 text-xs text-red-600">{error}</div>;
  }
  if (!ready) {
    return <div className="px-2 py-1.5 text-xs text-zinc-500">Loading files…</div>;
  }
  if (files.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-zinc-500">
        Open a STEP in this folder.
      </div>
    );
  }
  return (
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
      {recentRows.length > 0 ? (
        <div>
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Recent</div>
          <ul>
            {recentRows.map((row) => (
              <li key={`recent-${row.path}`}>
                <Row entry={row} current={current} onPick={onPick} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div>
          {recentRows.length > 0 ? (
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">All</div>
          ) : null}
          <ul>
            {rest.map((row) => (
              <li key={row.path}>
                <Row entry={row} current={current} onPick={onPick} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
