import { Box, Folder, MessageSquare, Scan } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { ChatPanel } from "@/components/ChatPanel";
import { ViewerChatProvider } from "@/components/chat/useViewerChat";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { DetailPanel } from "@/components/DetailPanel";
import { PairPage } from "@/components/PairPage";
import { QuestJoinPanel } from "@/components/QuestJoinPanel";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { useXrSession } from "@/hooks/useXrSession";
import { useXrSupport } from "@/hooks/useXrSupport";
import { ProjectSessionProvider, useProjectSession } from "@/hooks/useProjectSession";
import { fetchMe, type MePrincipal } from "@/lib/api";
import { redeemFragmentToken } from "@/lib/pairing";
import { ViewerCanvas } from "@/scene/ViewerCanvas";
import { useStore } from "@/state/store";
import { enterAR, enterVR } from "@/xrStore";

function ChatToggle() {
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  return (
    <div className="pointer-events-auto rounded-xl border border-zinc-200 bg-white/95 p-1 shadow-lg">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={chatOpen ? "h-9 w-9 bg-zinc-200 p-0" : "h-9 w-9 p-0"}
        title={chatOpen ? "Close chat" : "Open chat"}
        onClick={() => setChatOpen((open) => !open)}
      >
        <MessageSquare />
      </Button>
    </div>
  );
}

function EnterXr() {
  const { ar, vr, ready } = useXrSupport();
  if (!ready || (!ar && !vr)) return null;
  const studio = vr;
  return (
    <Button type="button" size="sm" className="pointer-events-auto shadow-lg" onClick={() => void (studio ? enterVR() : enterAR())}>
      {studio ? <Box /> : <Scan />}
      {studio ? "Enter Studio" : "Enter AR"}
    </Button>
  );
}

function Overlay({ host }: { host: boolean }) {
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
  const project = useProjectSession().project;
  const treeOpen = useStore((s) => s.treeOpen);
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  const switching = useStore((s) => s.switching);
  if (switching) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="text-base font-medium">
            {switching === "ar" ? "Switching to passthrough…" : "Switching to Studio…"}
          </div>
          <div className="mt-1 text-sm text-zinc-400">Stay in this tab</div>
        </div>
      </div>
    );
  }
  return (
    <>
      {!session && (
        <>
          {!treeOpen ? (
            <Button
              type="button"
              variant="secondary"
              className="pointer-events-auto absolute top-4 left-3 z-10 h-9 max-w-48 gap-2 shadow-lg"
              title="Show files"
              onClick={() => setTreeOpen(true)}
            >
              <Folder className="size-4" />
              <span className="truncate">
                {project.path.split("/").filter(Boolean).pop() ?? "Files"}
              </span>
            </Button>
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
          <DetailPanel />
          <div className="pointer-events-none absolute top-4 right-4 z-10 flex items-start gap-2">
            <ChatToggle />
            {host ? <QuestJoinPanel /> : null}
            <EnterXr />
          </div>
        </>
      )}
      {!session && !review && progress === null && !error && (
        <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white/80 px-6 py-4 text-center text-sm text-zinc-500 shadow-sm">
            {project.path ? "Pick a STEP from Files on the left." : "Open a folder on the left, then a STEP."}
          </div>
        </div>
      )}
      {progress !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto w-72 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white/95 p-4 text-center shadow-lg">
          <strong className="text-sm">Loading CAD model</strong>
          <div className="mt-1 text-xs text-zinc-500">
            {progress === 0 ? "Preparing model…" : `Loading model… ${progress}%`}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-100">
            <div className="h-full bg-zinc-900" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <div className="pointer-events-auto absolute inset-x-0 top-1/2 z-20 mx-auto w-80 -translate-y-1/2 rounded-xl border border-red-200 bg-white p-4 text-sm shadow-lg">
          <strong>Could not load the CAD model</strong>
          <div className="mt-1 text-zinc-600">{error}</div>
        </div>
      )}
    </>
  );
}

function ViewerShell({ host }: { host: boolean }) {
  const session = useXrSession();
  const chatOpen = useStore((s) => s.chatOpen);
  const treeOpen = useStore((s) => s.treeOpen);
  return (
    <div className="flex h-dvh w-full">
      {!session && treeOpen ? <DesktopSidebar host={host} /> : null}
      <div className="relative min-h-0 min-w-0 flex-1">
        <ViewerCanvas />
        <Overlay host={host} />
      </div>
      {!session && chatOpen ? <ChatPanel /> : null}
    </div>
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
      <div className="grid h-dvh place-items-center bg-zinc-50 text-sm text-zinc-500">Loading…</div>
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
