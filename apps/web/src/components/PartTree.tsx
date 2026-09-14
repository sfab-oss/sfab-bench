import { ChevronDown, ChevronRight, FolderOpen, ListTree, PanelLeftClose } from "lucide-react";
import { useMemo, useState } from "react";
import type { Object3D } from "three";
import { useShallow } from "zustand/react/shallow";

import { namedKids, treeTops } from "@/cad/tree";
import { FilePickerList } from "@/components/FilePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useOpenOnSelect } from "@/hooks/useTreeNode";
import { useStore } from "@/state/store";
import { cn } from "@/lib/utils";

function Node({ obj }: { obj: Object3D }) {
  const { review, selectedId, select, isolate, setVisible, hiddenIds } = useStore(
    useShallow((s) => ({
      review: s.review,
      selectedId: s.selectedId,
      select: s.select,
      isolate: s.isolate,
      setVisible: s.setVisible,
      hiddenIds: s.hiddenIds,
    })),
  );
  const part = review?.partByObject.get(obj);
  const kids = review ? namedKids(obj, review) : [];
  const [open, setOpen] = useOpenOnSelect(obj);
  if (!review || !part) {
    return (
      <>
        {kids.map((child) => (
          <Node key={child.uuid} obj={child} />
        ))}
      </>
    );
  }
  const selected = selectedId === part.id;
  return (
    <div>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[13px]",
          selected && "bg-blue-400 text-zinc-900",
          !selected && "hover:bg-zinc-100",
        )}
        onClick={() => select(part.id)}
        onDoubleClick={() => isolate(part.id)}
      >
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center text-zinc-500"
          onClick={(ev) => {
            ev.stopPropagation();
            if (kids.length) setOpen((v) => !v);
          }}
        >
          {kids.length ? open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" /> : null}
        </button>
        <input
          type="checkbox"
          className="size-3.5 accent-zinc-900"
          checked={!hiddenIds.has(part.id)}
          onClick={(ev) => ev.stopPropagation()}
          onChange={(ev) => setVisible(part.id, ev.target.checked)}
        />
        <span className="size-2.5 shrink-0 rounded-[2px] border border-zinc-300" style={{ background: part.color }} />
        <span className="min-w-0 flex-1 truncate">{part.name}</span>
      </div>
      {open && kids.length > 0 && (
        <div className="ml-3 border-l border-zinc-200 pl-1">
          {kids.map((child) => (
            <Node key={child.uuid} obj={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PartTree() {
  const { review, title, url, treeOpen, setTreeOpen, recentFiles } = useStore(
    useShallow((s) => ({
      review: s.review,
      title: s.title,
      url: s.url,
      treeOpen: s.treeOpen,
      setTreeOpen: s.setTreeOpen,
      recentFiles: s.recentFiles,
    })),
  );
  const { setDoc } = useProjectSession();
  const [filter, setFilter] = useState("");
  const [collapseKey, setCollapseKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { files, error, ready, reload } = useCatalog(treeOpen || pickerOpen);
  const tops = useMemo(
    () => (review ? treeTops(review) : []),
    [review],
  );
  if (!treeOpen) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="pointer-events-auto absolute top-16 left-3 z-10 h-auto max-w-[220px] gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-[13px] font-medium shadow-lg"
        title="Show model tree"
        onClick={() => setTreeOpen(true)}
      >
        <ListTree className="size-4 shrink-0" />
        <span className="truncate">Model</span>
      </Button>
    );
  }
  const q = filter.trim().toLowerCase();
  return (
    <aside className="pointer-events-auto absolute top-16 left-3 z-10 flex w-[280px] max-h-[min(32rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-lg">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-2 py-2 text-[13px] font-medium">
        <span className="min-w-0 flex-1 truncate px-1">Model</span>
        <span className="flex items-center gap-1">
          <Popover
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (open) reload();
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="Open"
                />
              }
            >
              <FolderOpen className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <FilePickerList
                files={files}
                recents={recentFiles}
                current={url}
                error={error}
                ready={ready}
                onPick={(path) => {
                  setPickerOpen(false);
                  void setDoc(path);
                }}
              />
            </PopoverContent>
          </Popover>
          {review ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-zinc-500"
              onClick={() => setCollapseKey((k) => k + 1)}
            >
              Collapse all
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            title="Collapse tree"
            onClick={() => setTreeOpen(false)}
          >
            <PanelLeftClose />
          </Button>
        </span>
      </header>
      <div className="truncate border-b border-zinc-100 px-3 py-1.5 text-[12px] text-zinc-500">
        {url ? title : "No file"}
      </div>
      {review ? (
        <>
          <Input
            className="mx-3 mt-2 mb-1 h-7 w-auto text-[13px]"
            placeholder="Filter parts…"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
          />
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            <div key={collapseKey}>
              {tops
                .filter((obj) => {
                  if (!q) return true;
                  const part = review.partByObject.get(obj);
                  return (part?.name ?? obj.name).toLowerCase().includes(q);
                })
                .map((obj) => (
                  <Node key={obj.uuid} obj={obj} />
                ))}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-[13px] text-zinc-500">
          Open a STEP in this folder.
        </div>
      )}
    </aside>
  );
}
