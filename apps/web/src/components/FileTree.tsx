import { ChevronRight, FileBox, Folder } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
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

type KindFilter = "all" | CatalogEntry["kind"];

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
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
      <span className="min-w-0 flex-1 truncate text-sidebar-foreground" title={name}>
        {name}
      </span>
    </>
  );
  const shared = {
    isActive: active,
    title: `Open ${name}`,
    onClick: () => onPick(node.path),
    className: "text-sidebar-foreground [&>svg]:text-sidebar-foreground",
  };
  if (nested) {
    return (
      <SidebarMenuSubButton {...shared}>
        {inner}
      </SidebarMenuSubButton>
    );
  }
  return (
    <SidebarMenuButton {...shared}>
      {inner}
    </SidebarMenuButton>
  );
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
        className="group/collapsible [&[data-open]>button>svg:first-child]:rotate-90"
        open={open}
        onOpenChange={(next) => toggle(node.path, next)}
      >
        <CollapsibleTrigger
          className="peer/menu-button flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 pr-9 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <ChevronRight className="transition-transform" />
          <Folder />
          <span>{node.name}</span>
        </CollapsibleTrigger>
        <SidebarMenuBadge>{count}</SidebarMenuBadge>
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
  const [kind, setKind] = useState<KindFilter>("all");
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
        if (catalogLabel(file.path).toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) {
          for (const path of catalogAncestors(file.path)) next.add(path);
        }
      }
      return next;
    });
  }, [current, filter]);

  const setExpandedFromToggle = (path: string, next: boolean) => {
    setExpanded((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(path);
      else copy.delete(path);
      return copy;
    });
  };

  const dirs = catalogDirPaths(tree);

  if (error) {
    return <div className="px-4 py-2 text-xs text-red-600">{error}</div>;
  }
  if (!ready) {
    return <div className="px-4 py-2 text-xs text-muted-foreground">Loading files…</div>;
  }
  if (files.length === 0) {
    return <div className="px-4 py-2 text-xs text-muted-foreground">No STEP or GLB in this folder.</div>;
  }
  if (listed.length === 0) {
    return (
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {kind === "glb" ? "No GLB in this folder." : "No STEP in this folder."}
      </div>
    );
  }
  if (tree.length === 0) {
    return <div className="px-4 py-2 text-xs text-muted-foreground">No files match.</div>;
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
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {dirs.length > 0 ? (
          <SidebarGroupAction title="Collapse all" onClick={() => setExpanded(new Set())}>
            <ChevronRight className="rotate-90" />
            <span className="sr-only">Collapse all</span>
          </SidebarGroupAction>
        ) : null}
        <SidebarGroupContent>
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
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
