/** Which source file the Device screen is showing. Not a document. */

export const SOURCE_QUERY_EVENT = "sfab-source";

export function sourceUrl(): string {
  if (typeof window === "undefined") return "";
  return (
    new URLSearchParams(window.location.search).get("source")?.trim() ?? ""
  );
}

export function syncSourceQuery(path: string) {
  if (typeof window === "undefined") return;
  const next = new URL(window.location.href);
  const rel = path.trim();
  if (rel) next.searchParams.set("source", rel);
  else next.searchParams.delete("source");
  const want = next.pathname + next.search + next.hash;
  const have =
    window.location.pathname + window.location.search + window.location.hash;
  if (want !== have) window.history.replaceState(null, "", want);
  window.dispatchEvent(new Event(SOURCE_QUERY_EVENT));
}
