import { useEffect, useState } from "react";

/**
 * Desktop: same-origin iframe of `/preview/workbench` (orbit, click the hole,
 * canned chat). Mobile: a still that follows light/dark. The preview is not
 * `apps/web`: no XR, no folder picker, no CAD server.
 */
export function DesktopMock() {
  const [iframe, setIframe] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIframe(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      className="relative overflow-hidden border border-border bg-background"
      data-slot="desktop-mock"
    >
      {iframe ? (
        <iframe
          className="block h-[32rem] w-full bg-studio md:h-[46rem]"
          src="/preview/workbench"
          title="SFab Bench workbench preview"
        />
      ) : (
        <>
          <img
            alt="SFab Bench: files, a STEP on the canvas, and Codex chat"
            className="block h-auto w-full dark:hidden"
            height={900}
            src="/brand/preview-workbench-light.png"
            width={1440}
          />
          <img
            alt=""
            className="hidden h-auto w-full dark:block"
            height={900}
            src="/brand/preview-workbench.png"
            width={1440}
          />
        </>
      )}
    </div>
  );
}
