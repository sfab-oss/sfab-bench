import {
  ArrowUp,
  Axis3d,
  Box,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  FileBox,
  Focus,
  Folder,
  Hash,
  History,
  Home,
  ListTree,
  Mic,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  Plus,
  RefreshCw,
  Ruler,
  Scan,
  Settings,
} from "lucide-react";
import { type ComponentType, lazy, Suspense, useMemo, useState } from "react";
import {
  CadText,
  CodexMark,
  IconBtn,
  OverlayCard,
  ToolBtn,
} from "@/components/preview/preview-controls";
import type { PreviewSel } from "@/components/preview/preview-types";
import { cn } from "@/lib/utils";
import "./preview-chrome.css";

function CanvasFallback() {
  return <div className="h-full w-full bg-studio" />;
}

const PreviewCanvas: ComponentType<{
  axes?: boolean;
  hidden?: PreviewSel;
  onSelect: (id: PreviewSel) => void;
  selected: PreviewSel;
}> = import.meta.env.SSR
  ? CanvasFallback
  : lazy(() =>
      import("@/components/preview/preview-scene").then((m) => ({
        default: m.PreviewCanvas,
      }))
    );

type FileKind = "all" | "step" | "glb";
type Msg = { role: "user" | "assistant"; text: string };
type Tool = "select" | "measure";

const FILES = [
  { name: "bracket.step", kind: "step" as const, locked: false },
  { name: "housing.step", kind: "step" as const, locked: true },
  { name: "pin.glb", kind: "glb" as const, locked: true },
];

const SEED: Msg[] = [
  { role: "user", text: "What is this hole on #o12?" },
  {
    role: "assistant",
    text: "Clearance for M4. 4.5 mm through the flange.",
  },
];

function replyFor(text: string, selected: PreviewSel): string {
  const t = text.toLowerCase();
  if (t.includes("o12") || t.includes("hole") || selected === "o12") {
    return "Clearance for M4. 4.5 mm through. Depth 8.2 mm from the opposite face.";
  }
  return "This preview is a demo. Download the Mac app to talk to Codex on your folder.";
}

export function WorkbenchPreview() {
  const [filesOpen, setFilesOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [partsOpen, setPartsOpen] = useState(true);
  const [selected, setSelected] = useState<PreviewSel>("o12");
  const [hidden, setHidden] = useState<PreviewSel>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [axes, setAxes] = useState(false);
  const [kind, setKind] = useState<FileKind>("all");
  const [filter, setFilter] = useState("");
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [draft, setDraft] = useState("");
  const [threadTitle, setThreadTitle] = useState("What is this hole on #o12?");

  const listed = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return FILES.filter((f) => {
      if (kind !== "all" && f.kind !== kind) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, kind]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: replyFor(text, selected) },
    ]);
    if (messages.length === 0) setThreadTitle(text);
    setDraft("");
  };

  const detail =
    tool === "measure" || selected === "o12" || selected === "body";

  return (
    <div
      className="flex h-dvh min-h-0 overflow-hidden bg-studio text-foreground"
      data-preview-workbench
    >
      {filesOpen ? (
        <aside
          aria-label="Files"
          className="flex h-full w-[19rem] shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground"
        >
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-start gap-1">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent"
                title="Demo: this folder stays open"
                type="button"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  bench-lab
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
              <IconBtn
                aria-label="Hide files"
                className="mt-0.5 size-7"
                onClick={() => setFilesOpen(false)}
                title="Hide files"
              >
                <PanelLeft />
              </IconBtn>
            </div>
            <div className="flex items-center gap-1">
              <input
                aria-label="Search files"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onChange={(e) => setFilter(e.target.value)}
                placeholder={"Search files… \u2318K"}
                value={filter}
              />
              <IconBtn
                aria-label="Refresh files"
                className="size-8"
                title="Demo: files stay as they are"
                type="button"
              >
                <RefreshCw className="size-3.5" />
              </IconBtn>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
            <div className="relative flex w-full min-w-0 flex-col p-2">
              <div className="flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70">
                Files
              </div>
              <div className="flex gap-1 px-2 pb-1">
                {(
                  [
                    ["all", "All"],
                    ["step", "STEP"],
                    ["glb", "GLB"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      kind === id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                    )}
                    key={id}
                    onClick={() => setKind(id)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="px-1">
                <div className="flex h-8 w-full items-center gap-2 rounded-md p-2 text-sm">
                  <ChevronRight className="size-4 rotate-90" />
                  <Folder className="size-4" />
                  <span className="min-w-0 flex-1 truncate">cad</span>
                  <span className="ml-auto text-xs tabular-nums text-sidebar-foreground/70">
                    3
                  </span>
                </div>
                <ul className="ml-3.5 border-sidebar-border border-l px-1">
                  {listed.length === 0 ? (
                    <li className="px-2 py-1 text-xs text-muted-foreground">
                      No files match.
                    </li>
                  ) : (
                    listed.map((f) => (
                      <li key={f.name}>
                        <button
                          aria-current={!f.locked ? "true" : undefined}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm",
                            f.locked
                              ? "cursor-not-allowed text-sidebar-foreground/70"
                              : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          )}
                          onClick={() => undefined}
                          title={
                            f.locked
                              ? "Demo: this file stays closed"
                              : "cad/bracket.step"
                          }
                          type="button"
                        >
                          <FileBox className="size-4" />
                          <span className="min-w-0 flex-1 truncate">
                            {f.name}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 p-2">
            <button
              className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm hover:bg-sidebar-accent"
              title="Demo: settings stay in the Mac app"
              type="button"
            >
              <Settings className="size-4" />
              Settings
            </button>
            <span
              aria-label="Connected"
              className="relative flex size-4 items-center justify-center"
              role="status"
              title="Connected"
            >
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-muted-foreground/60" />
              <span className="relative inline-flex size-2 rounded-full bg-muted-foreground" />
            </span>
          </div>
        </aside>
      ) : null}

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-studio">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <Suspense fallback={<CanvasFallback />}>
            <PreviewCanvas
              axes={axes}
              hidden={hidden}
              onSelect={(id) => {
                setSelected(id);
                if (id) setTool("select");
              }}
              selected={selected}
            />
          </Suspense>

          {!filesOpen ? (
            <div className="pointer-events-auto absolute top-4 left-3 z-10">
              <OverlayCard>
                <IconBtn
                  aria-label="Show files"
                  onClick={() => setFilesOpen(true)}
                  title="Show files"
                >
                  <PanelLeft />
                </IconBtn>
              </OverlayCard>
            </div>
          ) : null}

          <div
            className="pointer-events-auto absolute z-20 flex gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-lg"
            style={{ top: 16, left: filesOpen ? 12 : 52 }}
          >
            <ToolBtn aria-label="Frame whole model" title="Frame whole model">
              <Home />
            </ToolBtn>
            <ToolBtn aria-label="Frame selection" title="Frame selection">
              <Scan />
            </ToolBtn>
            <ToolBtn
              aria-label="Isolate"
              disabled={selected === null}
              onClick={() => {
                if (selected === null) return;
                setHidden(selected === "o12" ? "body" : "o12");
              }}
              title="Isolate"
            >
              <Focus />
            </ToolBtn>
            <ToolBtn
              active={tool === "measure"}
              aria-label="Measure"
              onClick={() =>
                setTool((t) => (t === "measure" ? "select" : "measure"))
              }
              title="Measure"
            >
              <Ruler />
            </ToolBtn>
            <ToolBtn
              active={axes}
              aria-label="World axes"
              onClick={() => setAxes((v) => !v)}
              title="World axes"
            >
              <Axis3d />
            </ToolBtn>
          </div>

          {partsOpen ? (
            <aside className="pointer-events-auto absolute top-16 left-3 z-10 flex w-[280px] max-h-[min(20rem,calc(100%-6rem))] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-sm">
              <header className="flex shrink-0 items-center gap-2 border-border border-b px-3 py-2">
                <ListTree className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">Model</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    bracket.step
                  </div>
                </div>
                <IconBtn
                  aria-label="Hide model tree"
                  className="size-7"
                  onClick={() => setPartsOpen(false)}
                  title="Hide model tree"
                >
                  <PanelLeftClose />
                </IconBtn>
              </header>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2 text-[13px]">
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left",
                    selected === "body" && "bg-accent"
                  )}
                  onClick={() => setSelected("body")}
                  type="button"
                >
                  <span
                    className="size-3 shrink-0 rounded-[2px] border border-border"
                    style={{ background: "#8d8d8d" }}
                  />
                  bracket
                </button>
                <button
                  className={cn(
                    "ml-4 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left",
                    selected === "o12" && "bg-accent"
                  )}
                  onClick={() => setSelected("o12")}
                  type="button"
                >
                  <span
                    className="size-3 shrink-0 rounded-[2px] border border-border"
                    style={{ background: "#e4007c" }}
                  />
                  #o12
                </button>
              </div>
            </aside>
          ) : (
            <button
              className="pointer-events-auto absolute top-16 left-3 z-10 inline-flex h-9 items-center gap-2 rounded-md bg-secondary px-3 text-sm text-secondary-foreground shadow-lg"
              onClick={() => setPartsOpen(true)}
              type="button"
            >
              <ListTree className="size-4" />
              Model
            </button>
          )}

          {detail ? (
            <aside className="pointer-events-auto absolute top-16 right-4 z-10 w-[260px] overflow-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg">
              {tool === "measure" ? (
                <>
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">Measure</span>
                    <button
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setTool("select")}
                      type="button"
                    >
                      Done
                    </button>
                  </header>
                  <p className="mb-2 text-[12px] text-muted-foreground">
                    Click two places on the model.
                  </p>
                  <div className="mb-1 font-mono text-[12px]">1 —</div>
                  <div className="font-mono text-[12px]">2 —</div>
                </>
              ) : (
                <>
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">Selection</span>
                    <button
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelected(null)}
                      type="button"
                    >
                      Clear
                    </button>
                  </header>
                  <div className="mb-2 flex items-center gap-2 text-[13px]">
                    <span
                      className="size-3 shrink-0 rounded-[2px] border border-border"
                      style={{
                        background: selected === "o12" ? "#e4007c" : "#8d8d8d",
                      }}
                    />
                    <span className="font-medium">
                      {selected === "o12" ? "#o12" : "bracket"}
                    </span>
                  </div>
                  <code className="mb-3 block truncate rounded-md bg-muted px-2 py-1 text-[12px]">
                    {selected === "o12" ? "#o12" : "#o1"}
                  </code>
                </>
              )}
            </aside>
          ) : null}

          <div className="pointer-events-none absolute top-4 right-3 z-10 flex items-start gap-2">
            <OverlayCard className="pointer-events-auto p-1">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent"
                title="Demo: Quest stays in the Mac app"
                type="button"
              >
                <Box className="size-4" />
                Enter Studio
              </button>
            </OverlayCard>
            {!chatOpen ? (
              <OverlayCard className="pointer-events-auto">
                <IconBtn
                  aria-label="Show chat"
                  onClick={() => setChatOpen(true)}
                  title="Show chat"
                >
                  <PanelRight />
                </IconBtn>
              </OverlayCard>
            ) : null}
          </div>
        </div>
      </main>

      {chatOpen ? (
        <aside
          aria-label="Assistant"
          className="@container/chat flex h-full min-h-0 w-96 shrink-0 flex-col overflow-x-hidden border-border border-l bg-background"
        >
          <header className="flex h-12 shrink-0 items-center gap-1 border-border border-b px-2">
            <IconBtn
              aria-label="Hide chat"
              className="size-7"
              onClick={() => setChatOpen(false)}
              title="Hide chat"
            >
              <PanelRight />
            </IconBtn>
            <span className="mx-1 h-4 w-px bg-border" />
            <div className="min-w-0 flex-1 truncate px-2 text-sm font-medium">
              <CadText text={threadTitle} />
            </div>
            <IconBtn
              aria-label="Export"
              className="size-8"
              title="Demo: export stays in the Mac app"
            >
              <EllipsisVertical />
            </IconBtn>
            <IconBtn aria-label="History" className="size-8" title="History">
              <History />
            </IconBtn>
            <IconBtn
              aria-label="New chat"
              className="size-8"
              onClick={() => {
                setMessages([]);
                setThreadTitle("Assistant");
                setDraft("");
              }}
              title="New chat"
            >
              <Plus />
            </IconBtn>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div className="flex w-full justify-end" key={`u-${i}`}>
                  <div className="w-fit max-w-[80%] rounded-xl bg-secondary px-3 py-2 text-sm leading-relaxed text-secondary-foreground">
                    <CadText text={m.text} />
                  </div>
                </div>
              ) : (
                <div className="w-full text-sm leading-relaxed" key={`a-${i}`}>
                  <CadText text={m.text} />
                </div>
              )
            )}
          </div>
          <form
            className="relative w-full bg-background pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="p-2 @[360px]/chat:px-4 @[360px]/chat:pb-4">
              <div className="rounded-2xl border border-input bg-background shadow-xs dark:bg-input/30">
                <textarea
                  className="min-h-12 w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask for a change, or # a part…"
                  rows={2}
                  value={draft}
                />
                <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2">
                  <span className="inline-flex h-7 max-w-32 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground">
                    <CodexMark />
                    <span className="min-w-0 truncate">gpt-5</span>
                    <ChevronDown className="size-3 shrink-0" />
                  </span>
                  <span className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground">
                    Medium
                    <ChevronDown className="size-3" />
                  </span>
                  <IconBtn
                    aria-label="Mention a part (#)"
                    className="size-7"
                    title="Mention a part (#)"
                    type="button"
                  >
                    <Hash className="size-4" />
                  </IconBtn>
                  <div className="ml-auto flex items-center gap-1">
                    <IconBtn
                      aria-label="Start voice input"
                      className="size-8"
                      title="Demo: voice stays in the Mac app"
                      type="button"
                    >
                      <Mic />
                    </IconBtn>
                    <button
                      aria-label="Send"
                      className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                      disabled={!draft.trim()}
                      title={draft.trim() ? "Send" : "Enter a message to send"}
                      type="submit"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
              <p className="hidden px-2 pt-1 text-[11px] text-muted-foreground @[360px]/chat:block">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
          </form>
        </aside>
      ) : null}
    </div>
  );
}
