import { Box, PanelRight, Scan } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";

import { LiveDot } from "@/components/brand/LiveDot";
import { Lockup } from "@/components/brand/Lockup";
import { ChatPanel } from "@/components/ChatPanel";
import { ViewerChatProvider } from "@/components/chat/useViewerChat";
import { CrashCard } from "@/components/CrashCard";
import { BrowseFolderDialog, WelcomeFiles, WelcomeFolders, useOpenFolder } from "@/components/OpenFolder";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { DetailPanel } from "@/components/DetailPanel";
import { PairPage } from "@/components/PairPage";
import { PartTree } from "@/components/PartTree";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useCatalog } from "@/hooks/useCatalog";
import { useXrSession } from "@/hooks/useXrSession";
import { useXrSupport } from "@/hooks/useXrSupport";
import { ProjectSessionProvider, useProjectSession } from "@/hooks/useProjectSession";
import { fetchMe, jsonApi, type MePrincipal } from "@/lib/api";
import { filesRailToggleTitle, isMacPlatform } from "@/lib/files-rail";
import { displayLoadError, isUnavailableFolder, loadCardCopy } from "@/lib/load-copy";
import { redeemFragmentToken } from "@/lib/pairing";
import { ViewerCanvas } from "@/scene/ViewerCanvas";
import { useStore } from "@/state/store";
import { enterAR, enterVR } from "@/xrStore";

const BOOT_ME_TIMEOUT_MS = 4_000;

function ChatToggle() {
  const setChatOpen = useStore((s) => s.setChatOpen);
  return (
    <div className="pointer-events-auto rounded-xl border border-border bg-card/95 shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-9 w-9"
        title="Show chat"
        onClick={() => setChatOpen(true)}
      >
        <PanelRight />
        <span className="sr-only">Show chat</span>
      </Button>
    </div>
  );
}

function EnterXr() {
  const { ar, vr, ready } = useXrSupport();
  if (!ready || (!ar && !vr)) return null;
  const studio = vr;
  return (
    <div className="pointer-events-auto rounded-xl border border-border bg-card/95 p-1 shadow-lg">
      <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => void (studio ? enterVR() : enterAR())}>
        {studio ? <Box /> : <Scan />}
        {studio ? "Enter Studio" : "Enter AR"}
      </Button>
    </div>
  );
}

function Overlay({ folder }: { folder: ReturnType<typeof useOpenFolder> }) {
  const { review, progress, error, selectedId, fit, url, title, loadModel, sceneCrash } = useStore(
    useShallow((s) => ({
      review: s.review,
      progress: s.progress,
      error: s.error,
      selectedId: s.selectedId,
      fit: s.fit,
      url: s.url,
      title: s.title,
      loadModel: s.loadModel,
      sceneCrash: s.sceneCrash,
    })),
  );
  const session = useXrSession();
  const { project, setDoc, fileRecents } = useProjectSession();
  const { files, ready: catalogReady, error: catalogError } = useCatalog(Boolean(project.path));
  const treeOpen = useStore((s) => s.treeOpen);
  const chatOpen = useStore((s) => s.chatOpen);
  const switching = useStore((s) => s.switching);
  const folderGone = isUnavailableFolder(catalogError);
  const load = progress !== null ? loadCardCopy({ title, url, progress }) : null;
  if (switching) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-base font-medium">
            {switching === "ar" ? "Switching to passthrough…" : "Switching to Studio…"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Stay in this tab</div>
        </div>
      </div>
    );
  }
  return (
    <>
      {!session && (
        <>
          {!treeOpen ? (
            <div className="pointer-events-auto absolute top-4 left-3 z-10 rounded-xl border border-border bg-card/95 shadow-lg">
              <SidebarTrigger
                className="h-9 w-9"
                title={filesRailToggleTitle(isMacPlatform(navigator.platform, navigator.userAgent), "show")}
              />
            </div>
          ) : null}
          <Toolbar
            onHome={() => {
              if (review) fit?.(review.root);
            }}
            onFit={() => {
              const obj =
                selectedId !== null ? review?.parts[selectedId]?.object : review?.root;
              if (obj) fit?.(obj);
            }}
          />
          <PartTree />
          <DetailPanel />
          <div className="pointer-events-none absolute top-4 right-3 z-10 flex items-start gap-2">
            <EnterXr />
            {!chatOpen && project.path ? <ChatToggle /> : null}
          </div>
        </>
      )}
      {!session && !review && progress === null && !error && !sceneCrash && (
        <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
          <div className="pointer-events-auto flex w-80 flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/80 px-6 py-5 text-center shadow-sm">
            <Lockup />
            {project.path ? (
              folderGone ? (
                <UnavailableFolderCard onOpen={folder.canRegister ? () => void folder.requestOpen() : undefined} />
              ) : (
                <WelcomeFiles
                  recents={fileRecents}
                  hasCad={files.length > 0}
                  ready={catalogReady}
                  onPick={(path) => void setDoc(path)}
                />
              )
            ) : (
              <WelcomeFolders folder={folder} />
            )}
          </div>
        </div>
      )}
      {progress !== null && load && !sceneCrash && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto w-72 -translate-y-1/2 rounded-xl border border-border bg-card/95 p-4 text-center shadow-lg">
          <strong className="inline-flex items-center gap-2 text-sm">
            <LiveDot />
            {load.title}
          </strong>
          <div className="mt-1 text-xs text-muted-foreground">{load.detail}</div>
          {load.percent === null ? (
            <Spinner className="mx-auto mt-3" />
          ) : (
            <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
              <div className="h-full bg-brand" style={{ width: `${load.percent}%` }} />
            </div>
          )}
        </div>
      )}
      {error && !sceneCrash && (
        <div className="pointer-events-auto absolute inset-x-0 top-1/2 z-20 mx-auto w-80 -translate-y-1/2 rounded-xl border border-destructive bg-card p-4 text-sm shadow-lg">
          <strong>Couldn&apos;t open {title}</strong>
          <div className="mt-1 text-muted-foreground">{displayLoadError(error, project.path)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void loadModel(url)}>
              Retry
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadModel("")}>
              Close
            </Button>
          </div>
        </div>
      )}
      {sceneCrash ? (
        <div className="pointer-events-auto absolute inset-x-0 top-1/2 z-30 mx-auto flex justify-center">
          <CrashCard error={sceneCrash.error} onRetry={sceneCrash.reset} />
        </div>
      ) : null}
    </>
  );
}

function UnavailableFolderCard({ onOpen }: { onOpen?: () => void }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">This folder isn&apos;t available</p>
      {onOpen ? (
        <Button type="button" size="sm" onClick={onOpen}>
          Open folder
        </Button>
      ) : null}
    </div>
  );
}

function ViewerShell({ host }: { host: boolean }) {
  const session = useXrSession();
  const treeOpen = useStore((s) => s.treeOpen);
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  const url = useStore((s) => s.url);
  const folder = useOpenFolder(host);
  const projectPath = useProjectSession().project.path;
  const hasProject = Boolean(projectPath);
  const chatWidth = useStore((s) => s.chatWidth);
  return (
    <SidebarProvider
      className="h-dvh min-h-0 overflow-hidden"
      open={treeOpen}
      onOpenChange={setTreeOpen}
      style={{ "--sidebar-width": "19rem" } as CSSProperties}
    >
      {!session ? <DesktopSidebar host={host} folder={folder} /> : null}
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1">
          <RenderErrorBoundary
            resetKeys={[url]}
            fallback={({ error, reset }) => (
              <div className="absolute inset-0 z-10 grid place-items-center bg-studio">
                <CrashCard error={error} onRetry={reset} />
              </div>
            )}
          >
            <ViewerCanvas />
          </RenderErrorBoundary>
          <Overlay folder={folder} />
        </div>
      </SidebarInset>
      {!session && hasProject ? (
        <RenderErrorBoundary
          resetKeys={[projectPath]}
          fallback={({ error, reset }) => (
            <aside
              className="flex h-full shrink-0 items-center justify-center border-l border-border bg-background p-4"
              style={{ width: chatWidth }}
            >
              <CrashCard error={error} onRetry={reset} />
            </aside>
          )}
        >
          <ChatPanel />
        </RenderErrorBoundary>
      ) : null}
      <BrowseFolderDialog open={folder.dialogOpen} onOpenChange={folder.setDialogOpen} />
    </SidebarProvider>
  );
}

function ViewerApp({ host, you }: { host: boolean; you: { id: string; label: string } }) {
  useEffect(() => {
    const onSelect = (ev: Event) => ev.preventDefault();
    document.addEventListener("beforexrselect", onSelect);
    return () => document.removeEventListener("beforexrselect", onSelect);
  }, []);
  return (
    <ProjectSessionProvider you={you}>
      <ViewerChatProvider>
        <ViewerShell host={host} />
      </ViewerChatProvider>
    </ProjectSessionProvider>
  );
}

async function probeMe(): Promise<{ me: MePrincipal } | { reason: "unauth" | "down" }> {
  try {
    const res = await jsonApi.me.$get();
    if (!res.ok) return { reason: "unauth" };
    const body = await res.json();
    const me = (body.principal ?? null) as MePrincipal | null;
    if (!me) return { reason: "unauth" };
    return { me };
  } catch {
    return { reason: "down" };
  }
}

export function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [host, setHost] = useState(false);
  const [you, setYou] = useState<{ id: string; label: string }>({ id: "loopback", label: "Mac" });
  const [bootStuck, setBootStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setBootStuck(true);
    }, BOOT_ME_TIMEOUT_MS);
    void (async () => {
      try {
        await redeemFragmentToken();
      } catch {
        /* pair page will explain a bad fragment */
      }
      const result = await probeMe();
      if (cancelled) return;
      window.clearTimeout(timer);
      if ("me" in result) {
        setAuthed(true);
        setHost(result.me.kind === "loopback");
        setYou(youFromMe(result.me));
        setReady(true);
        return;
      }
      if (result.reason === "unauth") {
        setAuthed(false);
        setReady(true);
        const path = window.location.pathname;
        if (path !== "/pair" && path !== "/pair/") {
          window.history.replaceState(null, "", "/pair" + window.location.search);
        }
        return;
      }
      setBootStuck(true);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-studio px-4 text-sm text-muted-foreground">
        {bootStuck ? (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-base font-medium text-foreground">Couldn&apos;t reach this Mac</p>
            <p>This page didn&apos;t get a response from the workbench process.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2">
            <LiveDot />
            Loading…
          </span>
        )}
      </div>
    );
  }
  if (!authed) return <PairPage onPaired={() => {
    void fetchMe().then((me) => {
      setAuthed(me != null);
      setHost(me?.kind === "loopback");
      setYou(youFromMe(me));
    });
  }} />;
  return <ViewerApp host={host} you={you} />;
}

function youFromMe(me: MePrincipal | null): { id: string; label: string } {
  if (!me || me.kind === "loopback") return { id: "loopback", label: "Mac" };
  return { id: me.deviceId, label: me.label || "Quest" };
}
