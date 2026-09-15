import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Lockup } from "@/components/brand/Lockup";
import { EmptyFolderRail, type OpenFolderApi } from "@/components/OpenFolder";
import { FileTree } from "@/components/FileTree";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WorkbenchSettings } from "@/components/WorkbenchSettings";
import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";

export function DesktopSidebar({ host, folder }: { host: boolean; folder: OpenFolderApi }) {
  const { url, recentFiles } = useStore(
    useShallow((s) => ({
      url: s.url,
      recentFiles: s.recentFiles,
    })),
  );
  const { project, setDoc } = useProjectSession();
  const hasProject = Boolean(project.path);
  const { files, error, ready } = useCatalog(hasProject);
  const [filter, setFilter] = useState("");

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-start gap-1">
          {hasProject ? (
            <ProjectSwitcher path={project.path} canRegister={host} onOpenFolder={() => void folder.requestOpen()} />
          ) : (
            <div className="flex min-w-0 flex-1 items-center px-2 py-1.5">
              <Lockup />
            </div>
          )}
          <SidebarTrigger className="mt-0.5" />
        </div>
        {hasProject && folder.error ? (
          <p className="px-2 text-xs text-destructive">{folder.error}</p>
        ) : null}
        {hasProject ? (
          <SidebarInput
            placeholder="Search files…"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
          />
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {hasProject ? (
          <FileTree
            key={project.path}
            projectPath={project.path}
            files={files}
            current={url}
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
        <WorkbenchSettings host={host} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
