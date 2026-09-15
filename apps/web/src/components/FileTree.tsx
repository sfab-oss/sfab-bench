import { ChevronRight, EllipsisVertical, FileBox, Folder } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { showToast } from "@/components/ui/toast";
import { displayLoadError } from "@/lib/load-copy";
import {
  catalogEmptyReason,
  clampContextMenuPosition,
  defaultExpandedDirPaths,
  fileContextMenuIndexAfterKey,
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
import { copyText } from "@/lib/settings";
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

async function copyRelativePath(path: string) {
  const ok = await copyText(path);
  if (ok) showToast({ type: "success", title: "Copied" });
  else showToast({ type: "error", title: "Couldn't copy path" });
}

function CopyPathItem({ path, onDone }: { path: string; onDone?: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={0}
      className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent"
      onClick={() => {
        void copyRelativePath(path).then(() => onDone?.());
      }}
    >
      Copy relative path
    </button>
  );
}

function FileRow({
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
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setMenu(null);
    requestAnimationFrame(() => rowRef.current?.focus());
  }, []);
  const active = node.path === current;
  const name = node.name || fileName(node.path);
  const inner = (
    <>
      <FileBox className="text-sidebar-foreground" />
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground">{name}</span>
    </>
  );
  const shared = {
    ref: rowRef,
    isActive: active,
    title: node.path,
    onClick: () => onPick(node.path),
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      setActionsOpen(false);
      setMenu(
        clampContextMenuPosition(event.clientX, event.clientY, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    },
    className: "pr-8 text-sidebar-foreground [&>svg]:text-sidebar-foreground",
  };
  const Item = nested ? SidebarMenuSubItem : SidebarMenuItem;
  return (
    <Item>
      {nested ? (
        <SidebarMenuSubButton {...shared}>{inner}</SidebarMenuSubButton>
      ) : (
        <SidebarMenuButton {...shared}>{inner}</SidebarMenuButton>
      )}
      <Popover
        open={actionsOpen}
        onOpenChange={(next) => {
          setActionsOpen(next);
          if (next) setMenu(null);
        }}
      >
        <PopoverTrigger
          render={
            <SidebarMenuAction
              showOnHover
              title="File actions"
              aria-label="File actions"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            />
          }
        >
          <EllipsisVertical />
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" className="w-48 p-1">
          <CopyPathItem path={node.path} onDone={() => setActionsOpen(false)} />
        </PopoverContent>
      </Popover>
      {menu ? (
        <>
          <FileContextDismiss open onClose={closeMenu} />
          <FileContextMenu left={menu.left} top={menu.top} onClose={closeMenu}>
            <CopyPathItem path={node.path} onDone={closeMenu} />
          </FileContextMenu>
        </>
      ) : null}
    </Item>
  );
}

function FileContextMenu({
  left,
  top,
  onClose,
  children,
}: {
  left: number;
  top: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = fileContextMenuIndexAfterKey(event.key, Math.max(current, 0), items.length);
    if (next == null) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };
  return (
    <div
      ref={menuRef}
      role="menu"
      data-slot="popover-content"
      aria-label="File actions"
      className="fixed z-50 w-48 rounded-md border border-border bg-popover p-1 shadow-md"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

function FileContextDismiss({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return null;
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
    return <FileRow node={node} current={current} onPick={onPick} nested={nested} />;
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
          className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0"
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
            "rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
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
      <div className="px-4 py-2 text-xs text-error">{displayLoadError(error, projectPath)}</div>
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
          <SidebarGroupContent className="max-h-48 overflow-y-auto">
            <SidebarMenu>
              {recentRows.map((row) => (
                <FileRow
                  key={`recent-${row.path}`}
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup>
        <SidebarGroupLabel>Files</SidebarGroupLabel>
        <KindChips kind={kind} onKind={setKind} />
        {dirs.length > 0 ? (
          <SidebarGroupAction title="Collapse all" aria-label="Collapse all" onClick={collapseAll}>
            <ChevronRight className="rotate-90" />
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
