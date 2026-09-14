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

// The menu's Open Folder… opens the project in the main process, then says so
// here. The app already refreshes on this event, so nothing else has to know
// the desktop shell exists.
ipcRenderer.on("sfab:project-changed", () => {
  window.dispatchEvent(new Event("sfab-project"));
});
