import { DEVICE_QUERY_EVENT } from "./device-query";
import { SOURCE_QUERY_EVENT } from "./source-query";

/** Tab folder, next to `?file=` and `?device=`. See ADR 0006 and ADR 0008. */

/**
 * Next query string after a folder change. A different folder drops `file`
 * and `device` unless `clearFile` is false (a deep link filling the folder
 * must not lose the document it already named).
 */
export function applyProjectSearch(
  search: string,
  path: string,
  opts?: { clearFile?: boolean }
): { search: string; changed: boolean; clearedDevice: boolean } {
  const next = new URLSearchParams(search.replace(/^\?/, ""));
  const prev = next.get("project")?.trim() ?? "";
  const abs = path.trim();
  const changed = prev !== abs;
  if (abs) next.set("project", abs);
  else next.delete("project");
  let clearedDevice = false;
  if (changed && opts?.clearFile !== false) {
    next.delete("file");
    if (next.has("device")) {
      next.delete("device");
      clearedDevice = true;
    }
    next.delete("source");
  }
  return { search: next.toString(), changed, clearedDevice };
}

export function projectUrl(): string {
  if (typeof window === "undefined") return "";
  return (
    new URLSearchParams(window.location.search).get("project")?.trim() ?? ""
  );
}

/** Keep `?project=` in the page URL. See `applyProjectSearch`. */
export function syncProjectQuery(path: string, opts?: { clearFile?: boolean }) {
  if (typeof window === "undefined") return;
  const applied = applyProjectSearch(window.location.search, path, opts);
  const next = new URL(window.location.href);
  next.search = applied.search;
  const want = next.pathname + next.search + next.hash;
  const have =
    window.location.pathname + window.location.search + window.location.hash;
  if (want !== have) window.history.replaceState(null, "", want);
  if (applied.changed) window.dispatchEvent(new Event("sfab-project"));
  if (applied.clearedDevice)
    window.dispatchEvent(new Event(DEVICE_QUERY_EVENT));
  if (applied.changed && opts?.clearFile !== false)
    window.dispatchEvent(new Event(SOURCE_QUERY_EVENT));
}

export function appendProjectQuery(url: URL): URL {
  const project = projectUrl();
  if (project && !url.searchParams.has("project"))
    url.searchParams.set("project", project);
  return url;
}
