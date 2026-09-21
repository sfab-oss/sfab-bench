import { Container, Text } from "@react-three/uikit";
import { ChevronDown } from "@react-three/uikit-lucide";
import { useContext, useEffect, useMemo, useState } from "react";

import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { cadCatalog } from "@/lib/files-rail";
import {
  type CatalogEntry,
  type CatalogNode,
  catalogAncestors,
  catalogSections,
  catalogTree,
} from "@/lib/viewer-snapshot";
import { useStore } from "@/state/store";
import { FeedbackContext } from "@/xr/ui/ToolBtn";
import { useXrTheme } from "@/xr/ui/theme";
import { asciiSafe } from "@/xr/ui/UikitMarkdown";

function FileRow({
  name,
  path,
  current,
  depth,
  onPick,
}: {
  name: string;
  path: string;
  current: string;
  depth: number;
  onPick?: () => void;
}) {
  const { setDoc } = useProjectSession();
  const feedback = useContext(FeedbackContext);
  const theme = useXrTheme();
  const active = path === current;
  return (
    <Container
      width="100%"
      flexShrink={0}
      padding={6}
      paddingLeft={6 + depth * 12}
      borderRadius={8}
      backgroundColor={active ? theme.active : theme.muted}
      hover={{ backgroundColor: active ? theme.active : theme.hover }}
      active={{ backgroundColor: theme.pressed }}
      onHoverChange={(hovered: boolean) => feedback.hover(path, hovered)}
      onClick={() => {
        feedback.click();
        void setDoc(path);
        onPick?.();
      }}
    >
      <Text fontSize={13} color={theme.text}>
        {asciiSafe(name)}
      </Text>
    </Container>
  );
}

function DirNode({
  node,
  current,
  depth,
  expanded,
  toggle,
  onPick,
}: {
  node: Extract<CatalogNode, { type: "dir" }>;
  current: string;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onPick?: () => void;
}) {
  const feedback = useContext(FeedbackContext);
  const theme = useXrTheme();
  const open = expanded.has(node.path);
  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
      <Container
        flexDirection="row"
        flexShrink={0}
        alignItems="center"
        gap={4}
        width="100%"
        padding={6}
        paddingLeft={6 + depth * 12}
        borderRadius={8}
        backgroundColor={theme.muted}
        hover={{ backgroundColor: theme.hover }}
        active={{ backgroundColor: theme.pressed }}
        onHoverChange={(hovered: boolean) =>
          feedback.hover(`dir-${node.path}`, hovered)
        }
        onClick={() => {
          feedback.click();
          toggle(node.path);
        }}
      >
        <ChevronDown
          width={12}
          height={12}
          color={theme.text}
          transformRotateZ={open ? 0 : 90}
        />
        <Text fontSize={13} color={theme.text}>
          {asciiSafe(node.name)}
        </Text>
      </Container>
      {open
        ? node.children.map((child) => (
            <TreeNode
              key={child.type === "dir" ? `d:${child.path}` : child.path}
              node={child}
              current={current}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              onPick={onPick}
            />
          ))
        : null}
    </Container>
  );
}

function TreeNode({
  node,
  current,
  depth,
  expanded,
  toggle,
  onPick,
}: {
  node: CatalogNode;
  current: string;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onPick?: () => void;
}) {
  if (node.type === "file") {
    return (
      <FileRow
        name={node.name}
        path={node.path}
        current={current}
        depth={depth}
        onPick={onPick}
      />
    );
  }
  return (
    <DirNode
      node={node}
      current={current}
      depth={depth}
      expanded={expanded}
      toggle={toggle}
      onPick={onPick}
    />
  );
}

export function FilesList({ onPick }: { onPick?: () => void }) {
  const url = useStore((s) => s.url);
  const recents = useStore((s) => s.recentFiles);
  const projectPath = useProjectSession().project.path;
  const { files, error, ready } = useCatalog(Boolean(projectPath));
  const theme = useXrTheme();
  const cadFiles = useMemo(() => cadCatalog(files), [files]);
  const { recents: recentRows } = catalogSections(cadFiles, recents);
  const tree = useMemo(() => catalogTree(cadFiles), [cadFiles]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      if (prev.size === 0) {
        for (const node of tree) {
          if (node.type === "dir") {
            next.add(node.path);
            changed = true;
          }
        }
      }
      if (url) {
        for (const path of catalogAncestors(url)) {
          if (!next.has(path)) {
            next.add(path);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [tree, url]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const copy = new Set(prev);
      if (copy.has(path)) copy.delete(path);
      else copy.add(path);
      return copy;
    });
  };

  if (error) {
    return (
      <Text fontSize={12} color={theme.danger}>
        {asciiSafe(error)}
      </Text>
    );
  }
  if (!ready) {
    return (
      <Text fontSize={12} color={theme.subtle}>
        Loading files…
      </Text>
    );
  }
  if (cadFiles.length === 0) {
    return (
      <Text fontSize={12} color={theme.subtle}>
        {projectPath
          ? "This folder has no STEP or GLB."
          : "Open a folder first."}
      </Text>
    );
  }

  return (
    <>
      {recentRows.length > 0 ? (
        <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
          <Text fontSize={11} color={theme.subtle}>
            Recent
          </Text>
          {recentRows.map((row: CatalogEntry) => (
            <FileRow
              key={`recent-${row.path}`}
              name={row.path.split("/").filter(Boolean).pop() ?? row.path}
              path={row.path}
              current={url}
              depth={0}
              onPick={onPick}
            />
          ))}
        </Container>
      ) : null}
      <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
        {recentRows.length > 0 ? (
          <Text fontSize={11} color={theme.subtle}>
            Folders
          </Text>
        ) : null}
        {tree.map((node) => (
          <TreeNode
            key={node.type === "dir" ? `d:${node.path}` : node.path}
            node={node}
            current={url}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            onPick={onPick}
          />
        ))}
      </Container>
    </>
  );
}
