import { Display } from "@/components/ui/display";

/**
 * Slot for a Quest / Enter Studio video. Drop a file at
 * `public/demo/quest.mp4` and set `QUEST_DEMO_SRC` to `/demo/quest.mp4`.
 */
const QUEST_DEMO_SRC: string | null = null;

export function VrDemo() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-16" id="quest">
      <p className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.2em]">
        On the headset
      </p>
      <Display className="mt-3 max-w-3xl text-3xl sm:text-4xl">
        Same process. Quest Browser.
      </Display>
      <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
        Pair once on the same Wi-Fi. Enter Studio in the headset. Drop a capture
        in when you have one.
      </p>
      <div className="relative mt-8 aspect-video overflow-hidden border border-border bg-muted/10">
        {QUEST_DEMO_SRC ? (
          <video
            className="h-full w-full object-cover"
            controls
            playsInline
            preload="metadata"
            src={QUEST_DEMO_SRC}
          >
            <track kind="captions" />
          </video>
        ) : (
          <VrDemoPlaceholder />
        )}
      </div>
    </section>
  );
}

function VrDemoPlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <svg
        aria-hidden
        className="h-28 w-48 text-muted-foreground"
        fill="none"
        viewBox="0 0 192 96"
      >
        <ellipse
          cx="64"
          cy="48"
          opacity="0.45"
          rx="40"
          ry="36"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <ellipse
          cx="128"
          cy="48"
          opacity="0.45"
          rx="40"
          ry="36"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle cx="96" cy="48" fill="var(--brand)" r="5" />
      </svg>
      <div className="flex items-center gap-2 font-mono text-[0.6875rem] text-muted-foreground uppercase tracking-[0.16em]">
        <span
          aria-hidden
          className="inline-block border-y-[6px] border-y-transparent border-l-[10px] border-l-foreground"
        />
        Quest demo
      </div>
    </div>
  );
}
