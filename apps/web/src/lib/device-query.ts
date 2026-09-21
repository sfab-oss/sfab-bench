/** Tab firmware image, beside `?file=`. ADR 0008. */

export const DEVICE_QUERY_EVENT = "sfab-device";

export function deviceUrl(): string {
  if (typeof window === "undefined") return "";
  return (
    new URLSearchParams(window.location.search).get("device")?.trim() ?? ""
  );
}

export function syncDeviceQuery(path: string) {
  if (typeof window === "undefined") return;
  const next = new URL(window.location.href);
  const abs = path.trim();
  if (abs) next.searchParams.set("device", abs);
  else next.searchParams.delete("device");
  const want = next.pathname + next.search + next.hash;
  const have =
    window.location.pathname + window.location.search + window.location.hash;
  if (want !== have) window.history.replaceState(null, "", want);
  window.dispatchEvent(new Event(DEVICE_QUERY_EVENT));
}
