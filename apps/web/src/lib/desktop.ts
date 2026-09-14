/**
 * The desktop shell's bridge, injected by `apps/desktop/src/preload.ts`.
 * Absent in Chrome and on Quest, so every caller has to have a web fallback.
 */
export type DesktopBridge = {
  desktop: true;
  /** Native folder chooser. Resolves to null when the user cancels. */
  pickFolder(): Promise<string | null>;
  /** Paint the Electron window to match the page theme. No-op in the browser. */
  setTheme?(theme: "light" | "dark" | "system"): void;
};

declare global {
  interface Window {
    sfabBench?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.sfabBench ?? null;
}
