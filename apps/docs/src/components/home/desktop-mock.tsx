/**
 * Desktop-only stand-in for the workbench. Not `apps/web`. No XR, no CAD
 * server, no live chat. Replace later with a linked preview.
 */
export function DesktopMock() {
  return (
    <div
      className="relative overflow-hidden border border-border bg-background"
      data-slot="desktop-mock"
    >
      <div className="flex items-center gap-2 border-border border-b px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.16em]">
          sfab-bench · bracket.step
        </span>
      </div>
      <div className="grid min-h-[18rem] grid-cols-1 md:grid-cols-[10.5rem_minmax(0,1fr)_15.5rem]">
        <aside className="hidden border-border border-r bg-muted/20 p-3 md:block">
          <p className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Files
          </p>
          <ul className="mt-3 space-y-1 font-mono text-[0.6875rem] text-muted-foreground">
            <li>cad/</li>
            <li className="bg-brand/15 pl-3 text-foreground">bracket.step</li>
            <li className="pl-3">housing.step</li>
            <li className="pl-3">pin.glb</li>
            <li>notes.md</li>
          </ul>
        </aside>
        <div className="relative min-h-[14rem] bg-muted/10">
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 260"
          >
            <rect fill="transparent" height="260" width="400" />
            <g
              className="text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M64 188 L158 128 L262 164 L262 226 L158 198 L64 246 Z" />
              <path d="M158 128 L158 198" />
              <path d="M262 164 L158 198" />
              <path d="M88 176 L88 214 L130 198 L130 162 Z" />
              <circle cx="208" cy="168" r="20" />
              <circle cx="208" cy="168" r="8" />
            </g>
            <g fill="none" stroke="var(--brand)" strokeWidth="1.6">
              <circle cx="208" cy="168" r="20" />
            </g>
            <circle cx="208" cy="168" fill="var(--brand)" r="3" />
            <text
              className="fill-brand font-mono"
              fontSize="10"
              x="222"
              y="154"
            >
              #o12
            </text>
          </svg>
        </div>
        <aside className="flex flex-col border-border border-t bg-muted/20 md:border-t-0 md:border-l">
          <p className="border-border border-b px-3 py-1.5 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Codex
          </p>
          <div className="flex flex-1 flex-col gap-2 p-3 text-[0.8125rem] leading-snug">
            <p className="self-end rounded-md bg-muted px-2.5 py-1.5 text-foreground">
              What is this hole on{" "}
              <span className="font-mono text-brand">#o12</span>?
            </p>
            <p className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">
              Clearance for M4. 4.5 mm through the flange.
            </p>
            <p className="self-end rounded-md bg-muted px-2.5 py-1.5 text-foreground">
              Depth from the other side?
            </p>
            <p className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">
              8.2 mm through. I can tag the stack if you want.
            </p>
          </div>
          <div className="border-border border-t px-3 py-2 font-mono text-[0.625rem] text-muted-foreground">
            Ask about a face or part…
          </div>
        </aside>
      </div>
    </div>
  );
}
