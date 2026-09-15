import { ChevronDown, ChevronRight, ListTree, PanelLeftClose } from "lucide-react";
import { useMemo, useState } from "react";
import type { Object3D } from "three";
import { useShallow } from "zustand/react/shallow";

import { namedKids, treeTops } from "@/cad/tree";
import { CrashCard } from "@/components/CrashCard";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          selected ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-accent/60",
        )}
        onClick={() => select(part.id)}
        onDoubleClick={() => isolate(part.id)}
      >
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground"
          onClick={(ev) => {
            ev.stopPropagation();
            if (kids.length) setOpen((v) => !v);
          }}
        >
          {kids.length ? open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" /> : null}
        </button>
        <input
          type="checkbox"
          className="size-3.5 accent-foreground"
          checked={!hiddenIds.has(part.id)}
          onClick={(ev) => ev.stopPropagation()}
          onChange={(ev) => setVisible(part.id, ev.target.checked)}
        />
        <span className="size-2.5 shrink-0 rounded-[2px] border border-border" style={{ background: part.color }} />
        <span className="min-w-0 flex-1 truncate">{part.name}</span>
      </div>
      {open && kids.length > 0 && (
        <div className="ml-3 border-l border-border pl-1">
          {kids.map((child) => (
            <Node key={child.uuid} obj={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelTreeBody() {
  const { review } = useStore(useShallow((s) => ({ review: s.review })));
  const [filter, setFilter] = useState("");
  const [collapseKey, setCollapseKey] = useState(0);
  const tops = useMemo(() => (review ? treeTops(review) : []), [review]);
  const q = filter.trim().toLowerCase();
  if (!review) return null;
  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-2">
        <Input
          className="h-7 flex-1 text-[13px]"
          placeholder="Filter parts…"
          value={filter}
          onChange={(ev) => setFilter(ev.target.value)}
        />
        <button
          type="button"
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setCollapseKey((k) => k + 1)}
        >
          Collapse
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
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
  );
}

export function PartTree() {
  const url = useStore((s) => s.url);
  return (
    <RenderErrorBoundary
      resetKeys={[url]}
      fallback={({ error, reset }) => (
        <div className="pointer-events-auto absolute top-16 left-3 z-10">
          <CrashCard error={error} onRetry={reset} />
        </div>
      )}
    >
      <PartTreeBody />
    </RenderErrorBoundary>
  );
}

function PartTreeBody() {
  const { review, title, partsOpen, setPartsOpen } = useStore(
    useShallow((s) => ({
      review: s.review,
      title: s.title,
      partsOpen: s.partsOpen,
      setPartsOpen: s.setPartsOpen,
    })),
  );
  if (!review) return null;
  if (!partsOpen) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="pointer-events-auto absolute top-16 left-3 z-10 h-9 gap-2 shadow-lg"
        title="Show model tree"
        onClick={() => setPartsOpen(true)}
      >
        <ListTree className="size-4" />
        Model
      </Button>
    );
  }
  return (
    <aside className="pointer-events-auto absolute top-16 left-3 z-10 flex w-[280px] max-h-[min(32rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <ListTree className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground">Model</div>
          <div className="truncate text-[11px] text-muted-foreground">{title}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Hide model tree"
          onClick={() => setPartsOpen(false)}
        >
          <PanelLeftClose />
        </Button>
      </header>
      <ModelTreeBody />
    </aside>
  );
}
