import { ChevronRight, FileBox, Folder } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { displayLoadError } from "@/lib/load-copy";
import {
  catalogEmptyReason,
  defaultExpandedDirPaths,
  findFileTreeProject,
  loadFileTreeProjects,
  saveFileTreeProjects,
  upsertFileTreeProject,
  resolvedExpandedDirs,
  shouldRevealAncestors,
  withRevealedDirs,
  type CatalogKindFilter,
  type FileTreeRevealKey,
} from "@/lib/files-rail";
import { cn } from "@/lib/utils";
import {
  catalogAncestors,
  catalogDirPaths,
  catalogLabel,
  catalogNodeCount,
  catalogSections,
  catalogTree,
  filterCatalogTree,
  type CatalogEntry,
  type CatalogNode,
} from "@/lib/viewer-snapshot";

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function sameMembers(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((path) => other.has(path));
}

function topLevelDirPaths(files: CatalogEntry[]) {
  return catalogTree(files)
    .filter((node): node is Extract<CatalogNode, { type: "dir" }> => node.type === "dir")
    .map((node) => node.path);
}

function FileButton({
  node,
  current,
  onPick,
  nested,
}: {
  node: Extract<CatalogNode, { type: "file" }>;
  current: string;
  onPick: (path: string) => void;
  nested: boolean;
}) {
  const active = node.path === current;
  const name = node.name || fileName(node.path);
  const inner = (
    <>
      <FileBox className="text-sidebar-foreground" />
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground">{name}</span>
    </>
  );
  const shared = {
    isActive: active,
    title: node.path,
    onClick: () => onPick(node.path),
    className: "text-sidebar-foreground [&>svg]:text-sidebar-foreground",
  };
  if (nested) {
    return <SidebarMenuSubButton {...shared}>{inner}</SidebarMenuSubButton>;
  }
  return <SidebarMenuButton {...shared}>{inner}</SidebarMenuButton>;
}

function Tree({
  node,
  current,
  expanded,
  toggle,
  onPick,
  nested,
}: {
  node: CatalogNode;
  current: string;
  expanded: Set<string>;
  toggle: (path: string, next: boolean) => void;
  onPick: (path: string) => void;
  nested: boolean;
}) {
  if (node.type === "file") {
    const Item = nested ? SidebarMenuSubItem : SidebarMenuItem;
    return (
      <Item>
        <FileButton node={node} current={current} onPick={onPick} nested={nested} />
      </Item>
    );
  }

  const open = expanded.has(node.path);
  const count = catalogNodeCount(node);
  const Item = nested ? SidebarMenuSubItem : SidebarMenuItem;
  return (
    <Item>
      <Collapsible
        className="group/collapsible w-full min-w-0 [&[data-open]>button>svg:first-child]:rotate-90"
        open={open}
        onOpenChange={(next) => toggle(node.path, next)}
      >
        <CollapsibleTrigger
          className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <ChevronRight className="shrink-0 transition-transform" />
          <Folder className="shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={node.name}>
            {node.name}
          </span>
          <span className="ml-auto shrink-0 tabular-nums text-xs text-sidebar-foreground/70">{count}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.children.map((child) => (
              <Tree
                key={child.type === "dir" ? `d:${child.path}` : child.path}
                node={child}
                current={current}
                expanded={expanded}
                toggle={toggle}
                onPick={onPick}
                nested
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </Item>
  );
}

function KindChips({ kind, onKind }: { kind: CatalogKindFilter; onKind: (next: CatalogKindFilter) => void }) {
  return (
    <div className="flex gap-1 px-2 pb-1">
      {(
        [
          ["all", "All"],
          ["step", "STEP"],
          ["glb", "GLB"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            kind === id
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          )}
          onClick={() => onKind(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyHint({
  children,
  action,
  onAction,
}: {
  children: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <p className="px-2 py-1 text-xs text-muted-foreground">
      {children}{" "}
      <button
        type="button"
        className="font-medium text-sidebar-foreground hover:underline"
        onClick={onAction}
      >
        {action}
      </button>
    </p>
  );
}

export function FileTree({
  files,
  current,
  filter,
  projectPath,
  recents,
  error,
  ready,
  onPick,
  onClearSearch,
}: {
  files: CatalogEntry[];
  current: string;
  filter: string;
  projectPath: string;
  recents?: string[];
  error?: string | null;
  ready?: boolean;
  onPick: (path: string) => void;
  onClearSearch: () => void;
}) {
  const [kind, setKind] = useState<CatalogKindFilter>("all");
  const listed = useMemo(
    () => (kind === "all" ? files : files.filter((file) => file.kind === kind)),
    [files, kind],
  );
  const tree = useMemo(() => filterCatalogTree(catalogTree(listed), filter), [listed, filter]);
  const recentRows = useMemo(
    () => (filter.trim() || kind !== "all" ? [] : catalogSections(files, recents ?? []).recents),
    [files, recents, filter, kind],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const filesRef = useRef(files);
  filesRef.current = files;
  const currentRef = useRef(current);
  currentRef.current = current;
  const seenRef = useRef<string[]>([]);
  const seeded = useRef(false);
  const revealKeyRef = useRef<FileTreeRevealKey>({ current, filter, kind });
  const catalogKey = useMemo(
    () => [...files].map((file) => file.path).sort().join("\0"),
    [files],
  );

  const persist = useCallback((next: Set<string>, seen: string[]) => {
    seenRef.current = seen;
    saveFileTreeProjects(
      upsertFileTreeProject(loadFileTreeProjects(), {
        path: projectPath,
        expanded: [...next],
        seen,
        updatedAt: Date.now(),
      }),
    );
  }, [projectPath]);

  const seenDirs = () => (seenRef.current.length ? seenRef.current : catalogDirPaths(catalogTree(filesRef.current)));

  useEffect(() => {
    const listed = filesRef.current;
    if (!ready || error || listed.length === 0) return;
    const allDirs = catalogDirPaths(catalogTree(listed));
    const defaults = defaultExpandedDirPaths(topLevelDirPaths(listed), catalogAncestors(currentRef.current));
    const stored = seeded.current
      ? { path: projectPath, expanded: [...expandedRef.current], seen: seenRef.current, updatedAt: 0 }
      : findFileTreeProject(loadFileTreeProjects(), projectPath);
    seeded.current = true;
    const resolved = resolvedExpandedDirs(stored, defaults, allDirs);
    if (sameMembers(resolved, [...expandedRef.current]) && sameMembers(allDirs, seenRef.current)) return;
    const next = new Set(resolved);
    setExpanded(next);
    persist(next, allDirs);
  }, [catalogKey, projectPath, ready, error, persist]);

  useEffect(() => {
    if (!ready || error || !seeded.current) return;
    const nextKey: FileTreeRevealKey = { current, filter, kind };
    if (!shouldRevealAncestors(revealKeyRef.current, nextKey)) return;
    revealKeyRef.current = nextKey;
    const extra: string[] = [...catalogAncestors(current)];
    const q = filter.trim().toLowerCase();
    if (q) {
      for (const file of filesRef.current) {
        if (catalogLabel(file.path).toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) {
          extra.push(...catalogAncestors(file.path));
        }
      }
    }
    const { dirs, changed } = withRevealedDirs([...expandedRef.current], extra);
    if (!changed) return;
    const next = new Set(dirs);
    setExpanded(next);
    persist(next, seenDirs());
  }, [current, filter, kind, ready, error, persist]);

  const setExpandedFromToggle = (path: string, nextOpen: boolean) => {
    const copy = new Set(expandedRef.current);
    if (nextOpen) copy.add(path);
    else copy.delete(path);
    setExpanded(copy);
    persist(copy, seenDirs());
  };

  const collapseAll = () => {
    const empty = new Set<string>();
    setExpanded(empty);
    persist(empty, seenDirs());
  };

  const dirs = catalogDirPaths(tree);
  const empty = catalogEmptyReason({
    fileCount: files.length,
    listedCount: listed.length,
    treeCount: tree.length,
    kind,
  });

  if (error) {
    return (
      <div className="px-4 py-2 text-xs text-destructive">{displayLoadError(error, projectPath)}</div>
    );
  }
  if (!ready) {
    return <div className="px-4 py-2 text-xs text-muted-foreground">Loading files…</div>;
  }
  if (empty.type === "no-cad") {
    return <div className="px-4 py-2 text-xs text-muted-foreground">No STEP or GLB in this folder.</div>;
  }

  return (
    <>
      {recentRows.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentRows.map((row) => (
                <SidebarMenuItem key={`recent-${row.path}`}>
                  <FileButton
                    node={{
                      type: "file",
                      name: fileName(row.path),
                      path: row.path,
                      kind: row.kind,
                      entry: row,
                    }}
                    current={current}
                    onPick={onPick}
                    nested={false}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup>
        <SidebarGroupLabel>Files</SidebarGroupLabel>
        <KindChips kind={kind} onKind={setKind} />
        {dirs.length > 0 ? (
          <SidebarGroupAction title="Collapse all" onClick={collapseAll}>
            <ChevronRight className="rotate-90" />
            <span className="sr-only">Collapse all</span>
          </SidebarGroupAction>
        ) : null}
        <SidebarGroupContent>
          {empty.type === "kind" ? (
            <EmptyHint action="Show all" onAction={() => setKind("all")}>
              {empty.kind === "glb" ? "No GLB in this folder." : "No STEP in this folder."}
            </EmptyHint>
          ) : null}
          {empty.type === "search" ? (
            <EmptyHint action="Clear search" onAction={onClearSearch}>
              No files match.
            </EmptyHint>
          ) : null}
          {empty.type === "ready" ? (
            <SidebarMenu>
              {tree.map((node) => (
                <Tree
                  key={node.type === "dir" ? `d:${node.path}` : node.path}
                  node={node}
                  current={current}
                  expanded={expanded}
                  toggle={setExpandedFromToggle}
                  onPick={onPick}
                  nested={false}
                />
              ))}
            </SidebarMenu>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
