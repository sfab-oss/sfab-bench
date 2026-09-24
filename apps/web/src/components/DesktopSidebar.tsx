import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Lockup } from "@/components/brand/Lockup";
import { ConnectionStatusDot } from "@/components/ConnectionStatusDot";
import { FileTree } from "@/components/FileTree";
import { EmptyFolderRail, type OpenFolderApi } from "@/components/OpenFolder";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkbenchSettings } from "@/components/WorkbenchSettings";
import type { CatalogState } from "@/hooks/useCatalog";
import { useDevicePath } from "@/hooks/useDevicePath";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useSourcePath } from "@/hooks/useSourcePath";
import { commandPaletteShortcutLabel } from "@/lib/command-palette";
import { syncExperience, useExperience } from "@/lib/experience";
import {
  cadCatalog,
  deviceCatalog,
  filesRailToggleTitle,
} from "@/lib/files-rail";
import { refreshFilesTooltip } from "@/lib/motion";
import {
  isMacPlatform,
  matchesShortcut,
  shortcutTooltip,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

export function DesktopSidebar({
  host,
  folder,
  catalog,
}: {
  host: boolean;
  folder: OpenFolderApi;
  catalog: CatalogState;
}) {
  const { url, recentFiles } = useStore(
    useShallow((s) => ({
      url: s.url,
      recentFiles: s.recentFiles,
    }))
  );
  const {
    project,
    setDoc,
    connectionPhase,
    connectionLostShown,
    connectionOfferReload,
  } = useProjectSession();
  const hasProject = Boolean(project.path);
  const { files, error, ready, refreshing, reload } = catalog;
  const [filter, setFilter] = useState("");
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent
  );
  const device = useDevicePath();
  const source = useSourcePath();
  const mode = useExperience();
  const deviceMode = mode === "device";
  const listed = deviceMode ? deviceCatalog(files) : cadCatalog(files);
  const { toggleSidebar } = useSidebar();
  const filesTitle = filesRailToggleTitle(mac);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !matchesShortcut(event, "toggle-files", {
          mac,
          activeElement: document.activeElement,
        })
      )
        return;
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mac, toggleSidebar]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-start gap-1">
          {hasProject ? (
            <ProjectSwitcher
              path={project.path}
              canRegister={host}
              onOpenFolder={() => void folder.requestOpen()}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center px-2 py-1.5">
              <Lockup />
            </div>
          )}
          <SidebarTrigger className="mt-0.5" title={filesTitle} />
        </div>
        {hasProject && folder.error ? (
          <p className="px-2 text-xs text-error">{folder.error}</p>
        ) : null}
        {hasProject ? (
          <div className="flex gap-1 px-1">
            <Button
              type="button"
              size="sm"
              variant={deviceMode ? "ghost" : "secondary"}
              className="h-7 flex-1"
              onClick={() => syncExperience("cad")}
            >
              CAD
            </Button>
            <Button
              type="button"
              size="sm"
              variant={deviceMode ? "secondary" : "ghost"}
              className="h-7 flex-1"
              onClick={() => syncExperience("device")}
            >
              Device
            </Button>
          </div>
        ) : null}
        {hasProject ? (
          <div className="flex items-center gap-1">
            <SidebarInput
              className="min-w-0 flex-1"
              placeholder={`Search files… ${commandPaletteShortcutLabel(mac)}`}
              title={shortcutTooltip("Command palette", "command-palette", mac)}
              aria-label="Search files"
              value={filter}
              onChange={(ev) => setFilter(ev.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-8 shrink-0"
              title={refreshFilesTooltip(refreshing)}
              aria-label={refreshFilesTooltip(refreshing)}
              aria-busy={refreshing || undefined}
              onClick={() => reload({ explicit: true })}
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
            </Button>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {hasProject ? (
          <FileTree
            key={`${project.path}:${deviceMode ? "device" : "cad"}`}
            projectPath={project.path}
            files={listed}
            current={deviceMode ? source || device : url}
            kinds={!deviceMode}
            emptyLabel={
              deviceMode
                ? "No firmware image or source in this folder."
                : "No STEP or GLB in this folder."
            }
            filter={filter}
            recents={recentFiles}
            error={error}
            ready={ready}
            onPick={(path) => void setDoc(path)}
            onClearSearch={() => setFilter("")}
          />
        ) : (
          <EmptyFolderRail folder={folder} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <WorkbenchSettings host={host} />
          </div>
          <ConnectionStatusDot
            lostShown={connectionLostShown}
            offerReload={connectionOfferReload}
            phase={connectionPhase}
          />
        </div>
      </SidebarFooter>
      <SidebarRail title={filesTitle} />
    </Sidebar>
  );
}
