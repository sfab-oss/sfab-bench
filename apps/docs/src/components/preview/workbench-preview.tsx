import { type ComponentType, lazy, Suspense, useState } from "react";
import type { PreviewSel } from "@/components/preview/preview-types";

function CanvasFallback() {
  return <div className="h-full w-full bg-[#0c0c0c]" />;
}

const PreviewCanvas: ComponentType<{
  onSelect: (id: PreviewSel) => void;
  selected: PreviewSel;
}> = import.meta.env.SSR
  ? CanvasFallback
  : lazy(() =>
      import("@/components/preview/preview-scene").then((m) => ({
        default: m.PreviewCanvas,
      }))
    );

const FILES = [
  { name: "cad/", kind: "dir" as const },
  { name: "bracket.step", kind: "open" as const },
  { name: "housing.step", kind: "locked" as const },
  { name: "pin.glb", kind: "locked" as const },
  { name: "notes.md", kind: "locked" as const },
];

type Msg = { role: "user" | "assistant"; text: string };

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
  const [selected, setSelected] = useState<PreviewSel>("o12");
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const next: Msg[] = [
      ...messages,
      { role: "user", text },
      { role: "assistant", text: replyFor(text, selected) },
    ];
    setMessages(next);
    setDraft("");
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 border-border border-b px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.16em]">
          sfab-bench · bracket.step
        </span>
        {selected === "o12" ? (
          <span className="ml-auto font-mono text-[0.625rem] text-brand">
            #o12
          </span>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[10.5rem_minmax(0,1fr)_15.5rem]">
        <aside className="hidden border-border border-r bg-muted/20 p-3 md:block">
          <p className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Files
          </p>
          <ul className="mt-3 space-y-1 font-mono text-[0.6875rem]">
            {FILES.map((f) => (
              <li
                className={
                  f.kind === "open"
                    ? "bg-brand/15 pl-3 text-foreground"
                    : f.kind === "dir"
                      ? "text-muted-foreground"
                      : "cursor-not-allowed pl-3 text-muted-foreground/70"
                }
                key={f.name}
                title={
                  f.kind === "locked"
                    ? "Demo: this file stays closed"
                    : undefined
                }
              >
                {f.name}
              </li>
            ))}
          </ul>
        </aside>
        <div className="relative min-h-[14rem] bg-[#0c0c0c]">
          <Suspense fallback={<div className="h-full w-full bg-[#0c0c0c]" />}>
            <PreviewCanvas onSelect={setSelected} selected={selected} />
          </Suspense>
          {selected === "o12" ? (
            <span className="pointer-events-none absolute top-3 left-3 font-mono text-[0.625rem] text-brand uppercase tracking-[0.14em]">
              #o12 face
            </span>
          ) : null}
        </div>
        <aside className="flex min-h-0 flex-col border-border border-t bg-muted/20 md:border-t-0 md:border-l">
          <p className="border-border border-b px-3 py-1.5 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Codex
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-[0.8125rem] leading-snug">
            {messages.map((m, i) => (
              <p
                className={
                  m.role === "user"
                    ? "self-end rounded-md bg-muted px-2.5 py-1.5 text-foreground"
                    : "rounded-md border border-border px-2.5 py-1.5 text-muted-foreground"
                }
                key={`${m.role}-${i}`}
              >
                {m.text}
              </p>
            ))}
          </div>
          <form
            className="border-border border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              className="w-full bg-transparent px-1 py-1 font-mono text-[0.6875rem] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about a face or part…"
              value={draft}
            />
          </form>
        </aside>
      </div>
    </div>
  );
}
