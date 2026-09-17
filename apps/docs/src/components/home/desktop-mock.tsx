/**
 * Desktop-only placeholder of the workbench. Not the real `apps/web` client.
 * No XR, no CAD server, no live chat. Replace later with a linked preview.
 */
export function DesktopMock() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-background shadow-lg md:shadow-xl"
      data-slot="desktop-mock"
    >
      <div className="flex items-center gap-2 border-border border-b px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.16em]">
          sfab-bench · bracket.step
        </span>
      </div>
      <div className="grid min-h-[22rem] grid-cols-1 md:grid-cols-[11rem_minmax(0,1fr)_16rem]">
        <aside className="hidden border-border border-r bg-muted/20 p-3 md:block">
          <p className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Files
          </p>
          <ul className="mt-3 space-y-1.5 font-mono text-[0.6875rem] text-muted-foreground">
            <li className="text-foreground">cad/</li>
            <li className="pl-3 text-foreground">bracket.step</li>
            <li className="pl-3">housing.step</li>
            <li className="pl-3">pin.glb</li>
          </ul>
        </aside>
        <div className="relative min-h-[16rem] bg-muted/10">
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 280"
          >
            <rect fill="transparent" height="280" width="400" />
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              className="text-muted-foreground"
            >
              <path d="M70 190 L160 140 L250 170 L250 230 L160 200 L70 250 Z" />
              <path d="M160 140 L160 200" />
              <path d="M250 170 L160 200" />
              <circle cx="205" cy="175" r="18" />
            </g>
            <g fill="var(--brand)" opacity="0.85">
              <circle cx="205" cy="175" r="3" />
            </g>
            <text
              className="fill-muted-foreground font-mono"
              fontSize="10"
              x="188"
              y="214"
            >
              #o12 face
            </text>
          </svg>
        </div>
        <aside className="flex flex-col border-border border-t bg-muted/20 md:border-t-0 md:border-l">
          <p className="border-border border-b px-3 py-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Codex
          </p>
          <div className="flex flex-1 flex-col gap-3 p-3 text-sm">
            <p className="self-end rounded-md bg-muted px-3 py-2 text-foreground">
              What is this hole on{" "}
              <span className="font-mono text-brand">#o12</span>?
            </p>
            <p className="rounded-md border border-border px-3 py-2 text-muted-foreground leading-relaxed">
              Clearance for M4. Diameter 4.5 mm through the flange. I can
              measure the stack from the opposite face if you want the depth.
            </p>
          </div>
          <div className="border-border border-t px-3 py-2 font-mono text-[0.625rem] text-muted-foreground">
            Placeholder mock · desktop only
          </div>
        </aside>
      </div>
    </div>
  );
}
