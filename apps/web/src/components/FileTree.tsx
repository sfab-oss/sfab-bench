import { ChevronDown, ChevronRight, FileBox, Folder } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  catalogAncestors,
  catalogDirPaths,
  catalogKindLabel,
  catalogLabel,
  catalogNodeCount,
  catalogSections,
  catalogTree,
  filterCatalogTree,
  type CatalogEntry,
  type CatalogNode,
} from "@/lib/viewer-snapshot";
import { cn } from "@/lib/utils";

function DirRow({
  node,
  current,
  expanded,
  toggle,
  onPick,
  depth,
}: {
  node: Extract<CatalogNode, { type: "dir" }>;
  current: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onPick: (path: string) => void;
  depth: number;
}) {
  const open = expanded.has(node.path);
  const count = catalogNodeCount(node);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => toggle(node.path)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-zinc-400" />
        )}
        <Folder className="size-3.5 shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{count}</span>
      </button>
      {open
        ? node.children.map((child) => (
            <TreeNode
              key={child.type === "dir" ? `d:${child.path}` : child.path}
              node={child}
              current={current}
              expanded={expanded}
              toggle={toggle}
              onPick={onPick}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function FileRow({
  node,
  current,
  onPick,
  depth,
}: {
  node: Extract<CatalogNode, { type: "file" }>;
  current: string;
  onPick: (path: string) => void;
  depth: number;
}) {
  const active = node.path === current;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1 rounded-md py-0.5 pr-1 text-left text-[13px]",
        active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
      onClick={() => onPick(node.path)}
    >
      <span className="grid size-3.5 shrink-0 place-items-center">
        <FileBox className="size-3.5 text-zinc-400" />
      </span>
      <span className="min-w-0 flex-1 truncate">{catalogLabel(node.path)}</span>
      <span className="shrink-0 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
        {catalogKindLabel(node.kind)}
      </span>
    </button>
  );
}

function TreeNode(props: {
  node: CatalogNode;
  current: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onPick: (path: string) => void;
  depth: number;
}) {
  if (props.node.type === "dir") return <DirRow {...props} node={props.node} />;
  return <FileRow node={props.node} current={props.current} onPick={props.onPick} depth={props.depth} />;
}

export function FileTree({
  files,
  current,
  filter,
  recents,
  error,
  ready,
  onPick,
}: {
  files: CatalogEntry[];
  current: string;
  filter: string;
  recents?: string[];
  error?: string | null;
  ready?: boolean;
  onPick: (path: string) => void;
}) {
  const tree = useMemo(() => filterCatalogTree(catalogTree(files), filter), [files, filter]);
  const recentRows = useMemo(
    () => (filter.trim() ? [] : catalogSections(files, recents ?? []).recents),
    [files, recents, filter],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || files.length === 0) return;
    seeded.current = true;
    const next = new Set<string>();
    const walk = (nodes: ReturnType<typeof catalogTree>, depth: number) => {
      if (depth <= 0) return;
      for (const node of nodes) {
        if (node.type !== "dir") continue;
        next.add(node.path);
        walk(node.children, depth - 1);
      }
    };
    walk(catalogTree(files), 1);
    for (const path of catalogAncestors(current)) next.add(path);
    setExpanded(next);
  }, [files, current]);

  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const path of catalogAncestors(current)) next.add(path);
      const q = filter.trim().toLowerCase();
      if (!q) return next;
      for (const file of filesRef.current) {
        if (
          catalogLabel(file.path).toLowerCase().includes(q) ||
          file.path.toLowerCase().includes(q)
        ) {
          for (const path of catalogAncestors(file.path)) next.add(path);
        }
      }
      return next;
    });
  }, [current, filter]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const dirs = catalogDirPaths(tree);

  if (error) return <div className="px-2 py-2 text-xs text-red-600">{error}</div>;
  if (!ready) return <div className="px-2 py-2 text-xs text-zinc-500">Loading files…</div>;
  if (files.length === 0) {
    return <div className="px-2 py-2 text-xs text-zinc-500">No STEP or GLB in this folder.</div>;
  }
  if (tree.length === 0) {
    return <div className="px-2 py-2 text-xs text-zinc-500">No files match.</div>;
  }

  return (
    <div className="px-1 pb-2">
      {dirs.length > 0 ? (
        <div className="mb-1 flex gap-2 px-1 text-[11px] text-zinc-400">
          <button type="button" className="hover:text-zinc-700" onClick={() => setExpanded(new Set(dirs))}>
            Expand all
          </button>
          <button type="button" className="hover:text-zinc-700" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>
      ) : null}
      {recentRows.length > 0 ? (
        <div className="mb-2">
          <div className="px-1 pb-0.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
            Recent
          </div>
          {recentRows.map((row) => (
            <FileRow
              key={`recent-${row.path}`}
              node={{
                type: "file",
                name: catalogLabel(row.path),
                path: row.path,
                kind: row.kind,
                entry: row,
              }}
              current={current}
              onPick={onPick}
              depth={0}
            />
          ))}
          <div className="px-1 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
            Folders
          </div>
        </div>
      ) : null}
      {tree.map((node) => (
        <TreeNode
          key={node.type === "dir" ? `d:${node.path}` : node.path}
          node={node}
          current={current}
          expanded={expanded}
          toggle={toggle}
          onPick={onPick}
          depth={0}
        />
      ))}
    </div>
  );
}
