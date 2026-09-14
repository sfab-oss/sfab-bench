import { Container, Text } from "@react-three/uikit";
import { useContext } from "react";

import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import {
  catalogFolder,
  catalogKindLabel,
  catalogLabel,
  catalogSections,
  type CatalogEntry,
} from "@/lib/viewer-snapshot";
import { useStore } from "@/state/store";
import { asciiSafe } from "@/xr/ui/UikitMarkdown";
import { FeedbackContext, PRESSED } from "@/xr/ui/ToolBtn";

function FileRow({
  entry,
  current,
  onPick,
}: {
  entry: CatalogEntry;
  current: string;
  onPick?: () => void;
}) {
  const { setDoc } = useProjectSession();
  const feedback = useContext(FeedbackContext);
  const active = entry.path === current;
  const folder = catalogFolder(entry.path);
  const kind = catalogKindLabel(entry.kind);
  const sub = folder ? `${folder} · ${kind}` : kind;
  return (
    <Container
      width="100%"
      flexShrink={0}
      padding={6}
      gap={2}
      flexDirection="column"
      borderRadius={8}
      backgroundColor={active ? "#dbeafe" : "#f4f4f5"}
      hover={{ backgroundColor: active ? "#dbeafe" : "#e4e4e7" }}
      active={PRESSED}
      onHoverChange={(hovered: boolean) => feedback.hover(entry.path, hovered)}
      onClick={() => {
        feedback.click();
        void setDoc(entry.path);
        onPick?.();
      }}
    >
      <Container flexDirection="row" width="100%" alignItems="center" gap={6}>
        <Text fontSize={13} color="#18181b">
          {asciiSafe(catalogLabel(entry.path))}
        </Text>
      </Container>
      <Text fontSize={11} color="#a1a1aa">
        {asciiSafe(sub)}
      </Text>
    </Container>
  );
}

export function FilesList({ onPick }: { onPick?: () => void }) {
  const url = useStore((s) => s.url);
  const recents = useStore((s) => s.recentFiles);
  const { files, error, ready } = useCatalog(true);
  const { recents: recentRows, rest } = catalogSections(files, recents);

  if (error) {
    return (
      <Text fontSize={12} color="#b91c1c">
        {asciiSafe(error)}
      </Text>
    );
  }
  if (!ready) {
    return (
      <Text fontSize={12} color="#71717a">
        Loading files…
      </Text>
    );
  }
  if (files.length === 0) {
    return (
      <Text fontSize={12} color="#71717a">
        Open a STEP in this folder.
      </Text>
    );
  }

  return (
    <>
      {recentRows.length > 0 ? (
        <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
          <Text fontSize={11} color="#a1a1aa">
            Recent
          </Text>
          {recentRows.map((row) => (
            <FileRow key={`recent-${row.path}`} entry={row} current={url} onPick={onPick} />
          ))}
        </Container>
      ) : null}
      {rest.length > 0 ? (
        <Container width="100%" flexShrink={0} flexDirection="column" gap={2}>
          {recentRows.length > 0 ? (
            <Text fontSize={11} color="#a1a1aa">
              All
            </Text>
          ) : null}
          {rest.map((row) => (
            <FileRow key={row.path} entry={row} current={url} onPick={onPick} />
          ))}
        </Container>
      ) : null}
    </>
  );
}
