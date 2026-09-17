import { useState } from "react";
import { Display } from "@/components/ui/display";

const QUEST_VIDEO_ID = "VeDZJBtUcAE";
const QUEST_VIDEO_TITLE = "SFab Bench · Hand tracking demo";
const QUEST_POSTER = "/brand/quest-poster.jpg";
const QUEST_EMBED = `https://www.youtube-nocookie.com/embed/${QUEST_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`;

/**
 * YouTube cannot restyle its chrome. We keep our 16:9 frame, a custom poster,
 * and load the privacy-enhanced embed only after play.
 */
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
        Pair once on the same Wi-Fi. Enter Studio in the headset. Hands in this
        clip; controllers work the same way.
      </p>
      <QuestPlayer />
    </section>
  );
}

function QuestPlayer() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative mt-8 aspect-video overflow-hidden border border-border bg-studio">
      {playing ? (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          src={QUEST_EMBED}
          title={QUEST_VIDEO_TITLE}
        />
      ) : (
        <button
          aria-label={`Play ${QUEST_VIDEO_TITLE}`}
          className="group absolute inset-0 cursor-pointer"
          onClick={() => setPlaying(true)}
          type="button"
        >
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={QUEST_POSTER}
          />
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_0_0_8px_color-mix(in_oklch,var(--brand)_28%,transparent)] transition-transform group-hover:scale-105">
              <span
                aria-hidden
                className="ml-0.5 inline-block border-y-[8px] border-y-transparent border-l-[14px] border-l-current"
              />
            </span>
            <span className="bg-black/50 px-2 py-1 font-mono text-[0.6875rem] text-white uppercase tracking-[0.16em]">
              Hand tracking · Quest
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
