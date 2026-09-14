import { contextBridge, ipcRenderer } from "electron";

/**
 * The one thing a browser tab cannot do: hand the server a real folder path.
 * The web app feature-detects `window.sfabBench` and falls back to typing a
 * path when it is not there, so the same build runs in Chrome and on Quest.
 */
contextBridge.exposeInMainWorld("sfabBench", {
  desktop: true,
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("sfab:pick-folder"),
  setTheme: (theme: "light" | "dark" | "system"): void => ipcRenderer.send("sfab:theme", theme),
});

ipcRenderer.on("sfab:open-folder", (_event, path: unknown) => {
  if (typeof path !== "string" || !path) return;
  window.dispatchEvent(new CustomEvent("sfab-open-folder", { detail: path }));
});
