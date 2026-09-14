import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { Object3D } from "three";
import { useShallow } from "zustand/react/shallow";

import { namedKids, treeTops } from "@/cad/tree";
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

export function ModelTree() {
  const { review } = useStore(useShallow((s) => ({ review: s.review })));
  const [filter, setFilter] = useState("");
  const [collapseKey, setCollapseKey] = useState(0);
  const tops = useMemo(() => (review ? treeTops(review) : []), [review]);
  const q = filter.trim().toLowerCase();
  if (!review) {
    return <div className="px-3 py-3 text-[13px] text-zinc-500">Open a STEP to see its parts.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-2">
        <Input
          className="h-7 flex-1 text-[13px]"
          placeholder="Filter parts…"
          value={filter}
          onChange={(ev) => setFilter(ev.target.value)}
        />
        <button
          type="button"
          className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-800"
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
    </div>
  );
}
