import { Lockup } from "@/components/brand/Lockup";
import {
  type OpenFolderApi,
  OpenFolderButton,
  RecentFiles,
  StarterHint,
  WelcomeFolders,
} from "@/components/OpenFolder";
import { Button } from "@/components/ui/button";
import { useProjectSession } from "@/hooks/useProjectSession";
import { filesRailToggleTitle } from "@/lib/files-rail";
import { isMacPlatform } from "@/lib/shortcuts";
import { CAD_SKILL_URL, type EmptySceneKind } from "@/lib/welcome";
import { useStore } from "@/state/store";

function UnavailableFolderCard({ folder }: { folder: OpenFolderApi }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        This folder isn&apos;t available
      </p>
      {folder.canRegister ? <OpenFolderButton folder={folder} /> : null}
    </div>
  );
}

export function EmptyScene({
  scene,
  folder,
}: {
  scene: Exclude<EmptySceneKind, "none">;
  folder: OpenFolderApi;
}) {
  const { setDoc, fileRecents } = useProjectSession();
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  return (
    <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
      {scene === "welcome-hint" ? (
        <div className="pointer-events-auto flex flex-col items-center gap-2 text-center">
          <Lockup />
          <p className="text-sm text-muted-foreground">
            Open a folder of STEP or GLB to start.
          </p>
          <StarterHint />
        </div>
      ) : scene === "pick-file" ? (
        <p className="text-xs text-muted-foreground">
          Pick a STEP or GLB from Files
        </p>
      ) : (
        <div className="pointer-events-auto mx-4 flex w-full max-w-80 flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/80 px-6 py-5 text-center shadow-sm">
          {scene === "welcome-card" ? (
            <>
              <Lockup />
              <WelcomeFolders folder={folder} />
            </>
          ) : null}
          {scene === "folder-gone" ? (
            <>
              <Lockup />
              <UnavailableFolderCard folder={folder} />
            </>
          ) : null}
          {scene === "no-cad" ? (
            <>
              <Lockup />
              <p className="text-sm text-muted-foreground">
                This folder has no STEP or GLB. Drop one in, or{" "}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href={CAD_SKILL_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  install the CAD skill
                </a>{" "}
                we use and ask in chat.
              </p>
              {folder.canRegister ? <OpenFolderButton folder={folder} /> : null}
            </>
          ) : null}
          {scene === "show-files" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Show files to pick a STEP or GLB.
              </p>
              <Button
                type="button"
                size="sm"
                title={filesRailToggleTitle(
                  isMacPlatform(navigator.platform, navigator.userAgent),
                  "show"
                )}
                onClick={() => setTreeOpen(true)}
              >
                Show files
              </Button>
              <RecentFiles
                recents={fileRecents}
                onPick={(path) => void setDoc(path)}
              />
            </>
          ) : null}
          {folder.error && scene !== "welcome-card" ? (
            <p className="text-xs text-error">{folder.error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
