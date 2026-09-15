import { ChevronDown, ChevronRight, ListTree, PanelLeftClose } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Object3D } from "three";
import { useShallow } from "zustand/react/shallow";

import type { CadPart, CadReview } from "@/cad/review";
import { namedKids, treeTops } from "@/cad/tree";
import { CrashCard } from "@/components/CrashCard";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { disambiguateSiblingNames, fileStemFromLabel, partDisplayName } from "@/lib/part-label";
import { filterPartTree, type PartTreeItem } from "@/lib/part-tree";
import { useStore } from "@/state/store";
import { cn } from "@/lib/utils";

type TreeRow = PartTreeItem & { obj: Object3D; part: CadPart };

function partKey(part: CadPart): string {
  return part.cadRef ?? `id:${part.id}`;
}

function rowsFromObjs(
  objs: Object3D[],
  review: CadReview,
  fileStem: string | undefined,
): TreeRow[] {
  const mapped: TreeRow[] = [];
  for (const obj of objs) {
    const part = review.partByObject.get(obj);
    const kids = rowsFromObjs(namedKids(obj, review), review, fileStem);
    if (!part) {
      mapped.push(...kids);
      continue;
    }
    mapped.push({
      key: partKey(part),
      rawName: part.name,
      displayName: partDisplayName(part, part.cadRef, fileStem),
      children: kids,
      obj,
      part,
    });
  }
  const labels = disambiguateSiblingNames(
    mapped.map((row) => ({ key: row.key, display: row.displayName, ref: row.part.cadRef })),
  );
  return mapped.map((row) => ({ ...row, displayName: labels.get(row.key) ?? row.displayName }));
}

function Node({
  row,
  openKeys,
  onToggle,
}: {
  row: TreeRow;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { selectedId, select, isolate, fit, setVisible, hiddenIds } = useStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      select: s.select,
      isolate: s.isolate,
      fit: s.fit,
      setVisible: s.setVisible,
      hiddenIds: s.hiddenIds,
    })),
  );
  const kids = row.children as TreeRow[];
  const part = row.part;
  const selected = selectedId === part.id;
  const open = openKeys.has(row.key);
  return (
    <div>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[13px]",
          selected ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-accent/60",
        )}
        onClick={() => select(part.id)}
        onDoubleClick={() => {
          isolate(part.id);
          fit?.(part.object);
        }}
      >
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground"
          onClick={(ev) => {
            ev.stopPropagation();
            if (kids.length) onToggle(row.key);
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
        <span className="min-w-0 flex-1 truncate" title={part.name}>
          {row.displayName}
        </span>
      </div>
      {open && kids.length > 0 && (
        <div className="ml-3 border-l border-border pl-1">
          {kids.map((child) => (
            <Node key={child.key} row={child} openKeys={openKeys} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelTreeBody() {
  const { review, title, selectedId } = useStore(
    useShallow((s) => ({
      review: s.review,
      title: s.title,
      selectedId: s.selectedId,
    })),
  );
  const [filter, setFilter] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const openKeysRef = useRef(openKeys);
  openKeysRef.current = openKeys;
  const savedOpenKeys = useRef<Set<string> | null>(null);

  const fileStem = useMemo(() => {
    if (!review || review.parts.length !== 1) return undefined;
    const stem = fileStemFromLabel(title);
    return stem || undefined;
  }, [review, title]);

  const forest = useMemo(
    () => (review ? rowsFromObjs(treeTops(review), review, fileStem) : []),
    [review, fileStem],
  );
  const q = filter.trim();
  const filtered = useMemo(() => filterPartTree(forest, q), [forest, q]);
  const shown = q ? filtered.nodes : forest;
  const expandKey = filtered.expandKeys.join("\0");

  useEffect(() => {
    if (q) {
      if (savedOpenKeys.current === null) savedOpenKeys.current = new Set(openKeysRef.current);
      setOpenKeys((prev) => {
        const next = new Set(prev);
        for (const key of expandKey ? expandKey.split("\0") : []) next.add(key);
        return next;
      });
      return;
    }
    if (savedOpenKeys.current) {
      setOpenKeys(savedOpenKeys.current);
      savedOpenKeys.current = null;
    }
  }, [q, expandKey]);

  useEffect(() => {
    if (!review || selectedId === null) return;
    const selected = review.parts[selectedId]?.object;
    if (!selected) return;
    const keys: string[] = [];
    let cur: Object3D | null = selected.parent;
    while (cur) {
      const part = review.partByObject.get(cur);
      if (part) keys.push(partKey(part));
      cur = cur.parent;
    }
    if (!keys.length) return;
    setOpenKeys((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const key of keys) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [review, selectedId]);

  if (!review) return null;

  const toggle = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          onClick={() => setOpenKeys(new Set())}
        >
          Collapse
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {q && shown.length === 0 ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">
            No parts match.{" "}
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => setFilter("")}
            >
              Clear
            </button>
          </p>
        ) : (
          (shown as TreeRow[]).map((row) => (
            <Node key={row.key} row={row} openKeys={openKeys} onToggle={toggle} />
          ))
        )}
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
  const { review, title, url, partsOpen, setPartsOpen } = useStore(
    useShallow((s) => ({
      review: s.review,
      title: s.title,
      url: s.url,
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
      <ModelTreeBody key={url} />
    </aside>
  );
}
