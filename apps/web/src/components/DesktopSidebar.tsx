import { Folder, PanelLeftClose } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { FileTree } from "@/components/FileTree";
import { OpenFolderForm } from "@/components/OpenFolder";
import { ModelTree } from "@/components/PartTree";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

type Tab = "files" | "model";

export function DesktopSidebar({ host }: { host: boolean }) {
  const { url, title, setTreeOpen, recentFiles } = useStore(
    useShallow((s) => ({
      url: s.url,
      title: s.title,
      setTreeOpen: s.setTreeOpen,
      recentFiles: s.recentFiles,
    })),
  );
  const { project, setDoc } = useProjectSession();
  const { files, error, ready } = useCatalog(true);
  const [tab, setTab] = useState<Tab>("files");
  const [changing, setChanging] = useState(false);
  const [filter, setFilter] = useState("");
  const hasProject = Boolean(project.path);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
      {hasProject && !changing ? (
        <header className="flex shrink-0 items-start gap-1 border-b border-zinc-200 px-2 py-2">
          {host ? (
            <ProjectSwitcher path={project.path} onBrowse={() => setChanging(true)} />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1">
              <Folder className="size-4 shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">
                  {project.path.split("/").filter(Boolean).pop()}
                </div>
                <div className="truncate font-mono text-[11px] text-zinc-400" title={project.path}>
                  {project.path}
                </div>
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-0.5 h-7 w-7 p-0"
            title="Hide sidebar"
            onClick={() => setTreeOpen(false)}
          >
            <PanelLeftClose />
          </Button>
        </header>
      ) : (
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2.5">
          <div className="text-sm font-medium">{hasProject ? "Browse folders" : "Open a folder"}</div>
          <div className="flex items-center gap-1">
            {hasProject ? (
              <button
                type="button"
                className="text-[12px] text-zinc-500 hover:text-zinc-800"
                onClick={() => setChanging(false)}
              >
                Cancel
              </button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Hide sidebar"
              onClick={() => setTreeOpen(false)}
            >
              <PanelLeftClose />
            </Button>
          </div>
        </header>
      )}

      {host && (!hasProject || changing) ? (
        <OpenFolderForm
          onOpened={() => {
            setChanging(false);
            setTab("files");
          }}
        />
      ) : (
        <>
          <div className="flex shrink-0 gap-1 border-b border-zinc-200 px-2 py-1.5">
            {(
              [
                ["files", "Files"],
                ["model", "Model"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 text-[12px] font-medium",
                  tab === id ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-800",
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "files" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="px-3 pt-2">
                <Input
                  className="h-7 text-[13px]"
                  placeholder="Filter folders and files…"
                  value={filter}
                  onChange={(ev) => setFilter(ev.target.value)}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-auto pt-1">
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
              </div>
            </div>
          ) : (
            <>
              <div className="truncate border-b border-zinc-100 px-3 py-1.5 text-[12px] text-zinc-500">
                {url ? title : "No file open"}
              </div>
              <ModelTree />
            </>
          )}
        </>
      )}
    </aside>
  );
}
