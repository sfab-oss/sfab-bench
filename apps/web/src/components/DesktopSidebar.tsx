import { Folder } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

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
  const browsing = host && (!hasProject || changing);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        {hasProject && !changing ? (
          <div className="flex items-start gap-1">
            {host ? (
              <ProjectSwitcher path={project.path} onBrowse={() => setChanging(true)} />
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                <Folder className="size-4 shrink-0 text-sidebar-foreground/70" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{project.path.split("/").filter(Boolean).pop()}</div>
                  <div className="truncate font-mono text-[11px] text-sidebar-foreground/60" title={project.path}>
                    {project.path}
                  </div>
                </div>
              </div>
            )}
            <SidebarTrigger className="mt-0.5" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            <div className="text-sm font-medium">{hasProject ? "Browse folders" : "Open a folder"}</div>
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
