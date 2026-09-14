import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";

import { publicPort } from "@sfab-bench/server/config";

const ORIGIN = `https://127.0.0.1:${publicPort()}`;
const PRELOAD = join(__dirname, "preload.cjs");

/**
 * Packaged, everything sits next to main.cjs. From a checkout, the bundles stay
 * where they are built: the API beside the server's node_modules, and the web
 * client in its own dist.
 */
function beside(packaged: string, fromCheckout: string[]): string {
  const local = join(__dirname, packaged);
  return existsSync(local) ? local : join(__dirname, ...fromCheckout);
}

const SERVER = beside("api.mjs", ["..", "..", "server", "dist", "api.mjs"]);
const WEB_DIST = beside("web", ["..", "..", "web", "dist"]);

let server: UtilityProcess | null = null;
let window_: BrowserWindow | null = null;

/**
 * Talk to our own API. Not `fetch`: the server presents the self-signed
 * certificate the Quest is asked to trust, and Chromium's fetch in the main
 * process rejects it with no hook to say otherwise. This is loopback, and the
 * certificate is one we generated, so verifying it buys nothing.
 */
function api(path: string, init?: { method?: string; body?: string }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${ORIGIN}${path}`,
      {
        method: init?.method ?? "GET",
        rejectUnauthorized: false,
        headers: init?.body ? { "content-type": "application/json" } : undefined,
        timeout: 5_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end(init?.body);
  });
}

/** The server answers here once it is listening. Also true when one is already up. */
async function serverIsUp(): Promise<boolean> {
  try {
    const res = await api("/api/me");
    return res.status === 200;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the API never came up on ${ORIGIN}`);
}

/**
 * The server runs in a utility process rather than here: tessellating an 11 MB
 * STEP is ten seconds of wasm, and in the main process that is ten seconds of
 * frozen window.
 */
async function startServer(): Promise<void> {
  if (await serverIsUp()) {
    // A `pnpm dev` or `pnpm serve` is already on this port. Attach to it instead
    // of failing on EADDRINUSE, and leave it running when we quit.
    console.log(`[desktop] attaching to the server already on ${ORIGIN}`);
    return;
  }
  if (!existsSync(SERVER)) throw new Error(`the API bundle is missing at ${SERVER}`);
  console.log(`[desktop] starting api from ${SERVER}`);
  server = utilityProcess.fork(SERVER, [], {
    serviceName: "sfab-bench-api",
    stdio: "inherit",
    env: { ...process.env, SFAB_BENCH_WEB_DIST: WEB_DIST },
  });
  server.on("spawn", () => console.log("[desktop] api process spawned"));
  server.on("exit", (code) => {
    console.error(`[desktop] api exited (${code})`);
    server = null;
  });
  await waitForServer();
}

function stopServer(): void {
  server?.kill();
  server = null;
}

/** Open a folder as the project, the same call the web UI makes. */
async function openProject(path: string): Promise<void> {
  const res = await api("/api/project", { method: "POST", body: JSON.stringify({ path }) });
  if (res.status !== 200) {
    let message = `could not open ${path}`;
    try {
      message = (JSON.parse(res.body) as { error?: string }).error ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
}

async function pickFolder(parent?: BrowserWindow): Promise<string | null> {
  const result = parent
    ? await dialog.showOpenDialog(parent, { properties: ["openDirectory", "createDirectory"] })
    : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}

async function pickAndOpen(): Promise<void> {
  const win = window_;
  if (!win) return;
  const path = await pickFolder(win);
  if (!path) return;
  try {
    await openProject(path);
    win.webContents.send("sfab:project-changed");
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: "error",
      message: "Could not open that folder",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

function createWindow(): void {
  window_ = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "sfab-bench",
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  window_.on("closed", () => {
    window_ = null;
  });
  // Anything that is not our own page belongs in the user's browser.
  window_.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window_.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[desktop] window could not load ${url}: ${description} (${code})`);
  });
  window_.webContents.on("did-finish-load", () => console.log(`[desktop] window showing ${ORIGIN}`));
  void window_.loadURL(ORIGIN);
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: "appMenu" as const }] : []),
      {
        label: "File",
        submenu: [
          { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: () => void pickAndOpen() },
          { type: "separator" as const },
          isMac ? { role: "close" as const } : { role: "quit" as const },
        ],
      },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" as const },
          { role: "forceReload" as const },
          { role: "toggleDevTools" as const },
          { type: "separator" as const },
          { role: "resetZoom" as const },
          { role: "zoomIn" as const },
          { role: "zoomOut" as const },
          { type: "separator" as const },
          { role: "togglefullscreen" as const },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window_) {
      if (window_.isMinimized()) window_.restore();
      window_.focus();
    } else {
      createWindow();
    }
  });

  // The API serves HTTPS with the same self-signed certificate the Quest is
  // asked to trust. `certificate-error` only covers frame navigation, so the
  // page would load and then every .tess fetch would die on a failed handshake.
  // The session verifier is what covers subresources too. Loopback only;
  // everything else keeps Chromium's own answer.
  const trustLoopback = (request: { hostname: string }, callback: (verdict: number) => void) => {
    const ours = request.hostname === "127.0.0.1" || request.hostname === "localhost";
    callback(ours ? 0 : -3); // 0 trusts it, -3 keeps Chromium's own answer
  };
  app.on("certificate-error", (event, _webContents, url, _error, _certificate, callback) => {
    const trusted = url.startsWith(ORIGIN);
    if (trusted) event.preventDefault();
    callback(trusted);
  });

  ipcMain.handle("sfab:pick-folder", (event) =>
    pickFolder(BrowserWindow.fromWebContents(event.sender) ?? undefined),
  );

  app.whenReady().then(async () => {
    // Sessions cannot be touched before ready.
    session.defaultSession.setCertificateVerifyProc(trustLoopback);
    app.on("session-created", (created) => created.setCertificateVerifyProc(trustLoopback));
    buildMenu();
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox("sfab-bench could not start", err instanceof Error ? err.message : String(err));
      app.quit();
      return;
    }
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  // Closing the window leaves the server up so a paired Quest keeps working.
  // Quitting is what stops it.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", stopServer);
}
