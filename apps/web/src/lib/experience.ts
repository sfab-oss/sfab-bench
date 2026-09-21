import { useEffect, useState } from "react";

/** Which experience this tab is showing. Default is CAD. */
export type Experience = "cad" | "device";

export const EXPERIENCE_EVENT = "sfab-experience";

export function experience(): Experience {
  if (typeof window === "undefined") return "cad";
  return new URLSearchParams(window.location.search).get("experience") ===
    "device"
    ? "device"
    : "cad";
}

export function syncExperience(next: Experience) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (next === "device") url.searchParams.set("experience", "device");
  else url.searchParams.delete("experience");
  const want = url.pathname + url.search + url.hash;
  const have =
    window.location.pathname + window.location.search + window.location.hash;
  if (want !== have) window.history.replaceState(null, "", want);
  window.dispatchEvent(new Event(EXPERIENCE_EVENT));
}

export function useExperience(): Experience {
  const [value, setValue] = useState(experience);
  useEffect(() => {
    const sync = () => setValue(experience());
    window.addEventListener("popstate", sync);
    window.addEventListener(EXPERIENCE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(EXPERIENCE_EVENT, sync);
    };
  }, []);
  return value;
}
