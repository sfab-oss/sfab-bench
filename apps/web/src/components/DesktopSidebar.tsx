import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Lockup } from "@/components/brand/Lockup";
import { FileTree } from "@/components/FileTree";
import { OpenFolderForm } from "@/components/OpenFolder";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInput,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";

export function DesktopSidebar({ host }: { host: boolean }) {
  const { url, recentFiles } = useStore(
    useShallow((s) => ({
      url: s.url,
      recentFiles: s.recentFiles,
    })),
  );
  const { project, setDoc } = useProjectSession();
  const { files, error, ready } = useCatalog(true);
  const [changing, setChanging] = useState(false);
  const [filter, setFilter] = useState("");
  const hasProject = Boolean(project.path);
  const browsing = !hasProject || changing;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        {hasProject && !changing ? (
          <div className="flex items-start gap-1">
            <ProjectSwitcher path={project.path} canRegister={host} onBrowse={() => setChanging(true)} />
            <SidebarTrigger className="mt-0.5" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            {hasProject ? (
              <div className="text-sm font-medium">Browse folders</div>
            ) : (
              <Lockup />
            )}
            <div className="flex items-center gap-1">
              {hasProject ? (
                <button
                  type="button"
                  className="text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  onClick={() => setChanging(false)}
                >
                  Cancel
                </button>
              ) : null}
              <SidebarTrigger />
            </div>
          </div>
        )}
        {hasProject && !browsing ? (
          <SidebarInput
            placeholder="Search files…"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
          />
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {browsing ? (
          <OpenFolderForm
            canRegister={host}
            onOpened={() => {
              setChanging(false);
            }}
          />
        ) : (
          <FileTree
            key={project.path}
            files={files}
            current={url}
            filter={filter}
            recents={recentFiles}
            error={error}
            ready={ready}
            onPick={(path) => void setDoc(path)}
          />
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
