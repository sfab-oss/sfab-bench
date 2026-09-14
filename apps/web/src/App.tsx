import { Box, PanelRight, Scan } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";

import { LiveDot } from "@/components/brand/LiveDot";
import { Lockup } from "@/components/brand/Lockup";
import { ChatPanel } from "@/components/ChatPanel";
import { ViewerChatProvider } from "@/components/chat/useViewerChat";
import { BrowseFolderDialog, WelcomeFiles, WelcomeFolders, useOpenFolder } from "@/components/OpenFolder";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { DetailPanel } from "@/components/DetailPanel";
import { PairPage } from "@/components/PairPage";
import { PartTree } from "@/components/PartTree";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useCatalog } from "@/hooks/useCatalog";
import { useXrSession } from "@/hooks/useXrSession";
import { useXrSupport } from "@/hooks/useXrSupport";
import { ProjectSessionProvider, useProjectSession } from "@/hooks/useProjectSession";
import { fetchMe, type MePrincipal } from "@/lib/api";
import { redeemFragmentToken } from "@/lib/pairing";
import { ViewerCanvas } from "@/scene/ViewerCanvas";
import { useStore } from "@/state/store";
import { enterAR, enterVR } from "@/xrStore";

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
  const { review, progress, error, selectedId, fit } = useStore(
    useShallow((s) => ({
      review: s.review,
      progress: s.progress,
      error: s.error,
      selectedId: s.selectedId,
      fit: s.fit,
    })),
  );
  const session = useXrSession();
  const { project, setDoc, fileRecents } = useProjectSession();
  const { files, ready: catalogReady } = useCatalog(Boolean(project.path));
  const treeOpen = useStore((s) => s.treeOpen);
  const chatOpen = useStore((s) => s.chatOpen);
  const switching = useStore((s) => s.switching);
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
              <SidebarTrigger className="h-9 w-9" title="Show files" />
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
      {!session && !review && progress === null && !error && (
        <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
          <div className="pointer-events-auto flex w-80 flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/80 px-6 py-5 text-center shadow-sm">
            <Lockup />
            {project.path ? (
              <WelcomeFiles
                recents={fileRecents}
                hasCad={files.length > 0}
                ready={catalogReady}
                onPick={(path) => void setDoc(path)}
              />
            ) : (
              <WelcomeFolders folder={folder} />
            )}
          </div>
        </div>
      )}
      {progress !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto w-72 -translate-y-1/2 rounded-xl border border-border bg-card/95 p-4 text-center shadow-lg">
          <strong className="inline-flex items-center gap-2 text-sm">
            <LiveDot />
            Loading CAD model
          </strong>
          <div className="mt-1 text-xs text-muted-foreground">
            {progress === 0 ? "Preparing model…" : `Loading model… ${progress}%`}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
            <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <div className="pointer-events-auto absolute inset-x-0 top-1/2 z-20 mx-auto w-80 -translate-y-1/2 rounded-xl border border-destructive bg-card p-4 text-sm shadow-lg">
          <strong>Could not load the CAD model</strong>
          <div className="mt-1 text-muted-foreground">{error}</div>
        </div>
      )}
    </>
  );
}

function ViewerShell({ host }: { host: boolean }) {
  const session = useXrSession();
  const chatOpen = useStore((s) => s.chatOpen);
  const treeOpen = useStore((s) => s.treeOpen);
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  const folder = useOpenFolder(host);
  const hasProject = Boolean(useProjectSession().project.path);
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
          <ViewerCanvas />
          <Overlay folder={folder} />
        </div>
      </SidebarInset>
      {!session && chatOpen && hasProject ? <ChatPanel /> : null}
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

export function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [host, setHost] = useState(false);
  const [you, setYou] = useState<{ id: string; label: string }>({ id: "loopback", label: "Mac" });

  useEffect(() => {
    void (async () => {
      try {
        await redeemFragmentToken();
      } catch {
        /* pair page will explain a bad fragment */
      }
      const me = await fetchMe();
      setAuthed(me != null);
      setHost(me?.kind === "loopback");
      setYou(youFromMe(me));
      setReady(true);
      if (!me) {
        const path = window.location.pathname;
        if (path !== "/pair" && path !== "/pair/") {
          window.history.replaceState(null, "", "/pair" + window.location.search);
        }
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-studio text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <LiveDot />
          Loading…
        </span>
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
