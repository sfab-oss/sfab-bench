import { useEffect, useState } from "react";

import { useStore } from "@/state/store";
import { CardBody } from "@/xr/ui/CardBody";
import { DetailsCard } from "@/xr/ui/DetailsCard";
import { FilesCard } from "@/xr/ui/FilesCard";
import { HelpCard } from "@/xr/ui/HelpCard";
import { SettingsCard } from "@/xr/ui/SettingsCard";

export function CardPanels({ width = 204, height = 340 }: { width?: number; height?: number }) {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const [filesOpen, setFilesOpen] = useState(false);
  useEffect(() => {
    if (page === "settings" || page === "help") setFilesOpen(false);
  }, [page]);
  const settingsOpen = page === "settings" || page === "help";
  return (
    <>
      <CardBody
        width={width}
        height={height}
        filesOpen={filesOpen}
        onToggleFiles={() => {
          if (settingsOpen) setPage("tree");
          setFilesOpen((open) => (settingsOpen ? true : !open));
        }}
      />
      <group position={[width * 0.001 * 0.5 + 0.118, 0.03, 0]}>
        <DetailsCard />
      </group>
      {settingsOpen ? (
        <group position={[0, 0.04, 0.055]}>
          {page === "settings" ? <SettingsCard /> : <HelpCard />}
        </group>
      ) : null}
      {filesOpen ? (
        <group position={[0, 0.04, 0.055]}>
          <FilesCard onClose={() => setFilesOpen(false)} />
        </group>
      ) : null}
    </>
  );
}
