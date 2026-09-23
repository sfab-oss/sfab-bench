# Product

Living plan for this repo. Architecture detail is
[`architecture.md`](architecture.md). Expensive calls are
[`decisions/`](decisions/). How to run it is [`user/`](user/).

The 2026-09-13 survey that produced this direction is historical.
**This file is the source of truth for what we are building next.**

## What this is

A CAD workbench that talks to a STEP using the AI subscriptions already
on the Mac (Codex, Claude Code, Cursor, Grok, OpenCode). Cursor is listed
but a Mac login is not visible to this app yet. This app does not take
API keys for chat.

Three jobs, kept separate:

| Job | Who |
| --- | --- |
| **Authoring** | Whatever produced the STEP or the flash image in the open folder (Jake cadgen, Fusion export, Arduino, ESP-IDF, a human, …). This app does not author, and it does not learn which tool did. |
| **Presence** | Two screens. CAD is the viewer: tessellated package, tree, selection, measure, Quest world. Device is a board view for a firmware image, with the serial console docked under it, desktop only. |
| **Agent host** | This Node process: open folder, harnesses, threads, `get_viewer` / `show_artifact`, and the same shape for a device. |

A firmware image is a document beside STEP and GLB
([ADR 0008](decisions/0008-second-domain.md)). CAD and Device are
separate screens. The combination is deferred. A real board is still
a later row.

North star: global server → **open a folder** → **open a STEP or a firmware image** → talk.
Quest Browser joins over HTTPS and shares the **library**, not the live
viewport ([ADR 0003](decisions/0003-library-not-viewport.md)).

## Locked

Do not re-open these unless the human asks.

- **No adapters.** Project = a directory. Document = a STEP, a GLB, or a firmware image named `.<chip>.bin` (first chip `esp32c3`, [ADR 0008](decisions/0008-second-domain.md)). Agent cwd = that directory. Skills live in the project if the user put them there. Bench does not learn which tool wrote the file.
- **Two screens.** CAD is STEP and GLB, the viewport, and `get_viewer` / `show_artifact`. Device is desktop only: `.<chip>.bin`, a fixed board view, and the serial console docked under it, with `get_device`, `run_firmware`, `read_serial`, and `send_serial`. One screen does not show the other's document. Quest stays CAD. Putting both on one screen is deferred.
- **One machine per document.** Keyed by the project plus the image path. Every tab watching it, and the agent tools, share that emulator or serial port and its log.
- **Tessellation is a loader**, not an adapter. OpenCascade WASM in the API process, and the only one, producing `assembly.json` + `.tess` + `#o…` ([ADR 0002](decisions/0002-step-loader-occt.md), [ADR 0004](decisions/0004-occt-via-opencascade-js.md)). The Python stopgap it replaced is gone.
- **One process, two HTTPS clients.** Mac tab (loopback trusted) and Quest Browser (paired). No Unity, no APK.
- **Share the library, not the viewport.** Recents, thread list, messages at rest, pairing. Not: the folder a tab is in, loaded file, selection, camera, XR, which chat is open, live stream. `show_artifact` moves only the asking client. Folder is `?project=` ([ADR 0006](decisions/0006-folder-is-a-tab.md)).
- **Desktop composer stays TipTap** for `#` chips (parts, faces, `#o…`). Quest stays plain input + voice.
- **Electron is a shell, not a client.** It starts the same server and loads the same `https://127.0.0.1:7322` page, and adds exactly one thing a browser cannot do: a native folder dialog ([ADR 0005](decisions/0005-electron-shell.md)). The browser path stays first-class — Quest depends on it.
- **Ship is a `.app` from GitHub Releases plus `serve`.** No npm until the repo is public. No cask, no auto-update until a notarised `.app` is in a public release.
- **Auth now is pairing.** Accounts are a later `principal.kind`. Never hold provider credentials; show the login command in the UI.
- **Do not merge** [`sfab-oss/sfab-cad`](https://github.com/sfab-oss/sfab-cad) ([ADR 0001](decisions/0001-new-private-repo.md)).
- Sphere-robot is a **folder you open**, not the app.

## Ranked next

Each row is one PR-sized unit. Update status here when it ships.

| # | Status | Item |
| --- | --- | --- |
| 1 | **done** | Pairing: loopback trusted, LAN needs a device token |
| 2 | **done** | Standalone Node server; Vite proxies `/api` in dev |
| 3 | **done** | Project folder + STEP loader + recents |
| 4 | **done** | Library, not viewport ([ADR 0003](decisions/0003-library-not-viewport.md)) |
| 5 | **done** | This repo; sphere-robot `xr-viewer/` deleted |
| 6 | **done** | Desktop layout (files left, model tree on canvas, chat right, provider status). TipTap `#` mentions from parts / faces / `#o…`; chips flatten to those refs; click a ref in the transcript selects on this tab |
| 7 | **partial** | Local CLI (`pnpm cli serve` / `dev` / `open`) prints URL, QR, pairing code. **`npx sfab-bench`: not until the repo is public** |
| 8 | later | `--tunnel` (pairing already required for non-loopback). Do not start until someone needs Quest off this LAN |
| 9 | **done** | Marketing site (`apps/docs`) on [bench.sfab.ai](https://bench.sfab.ai). Linking the real `apps/web` client (and XR in that preview): later. |
| 10 | **done** | Electron shell: native folder dialog, server starts with the app, keep-alive ([ADR 0005](decisions/0005-electron-shell.md)). `pnpm desktop:package` writes the `.app` and a `ditto` zip; signs with `CSC_NAME` when present, otherwise ad-hoc. Notarisation: gated on an Apple identity on the packaging Mac. |
| 11 | later | Account `principal.kind`. Only when 8 is used by more than one person |
| 12 | **done** | OCCT WASM loader. STEP opens with no Python ([ADR 0004](decisions/0004-occt-via-opencascade-js.md)) |
| 13 | **done** | sessions-01 — project is a request parameter, per-workspace `409` ([ADR 0006](decisions/0006-folder-is-a-tab.md)). Server and contract; web unchanged. |
| 14 | **done** | sessions-02 — `?project=` as tab state, switcher sets the tab instead of `POST /api/project`, paired clients pick from recents, ⌘O targets the window's tab. Welcome is `/`; a folder with no `?file=` is an empty scene. |
| 15 | **done** | ship-01 — tag `v0.1.0`: `bin` field, Releases zip via `ditto`, signing auto-detect with today's ad-hoc fallback, `install.md` recipe "now". `v0.1.1` restores Codex/OpenCode in the packaged app. `v0.2.0` is the desktop UX + harness + sessions cut. `v0.2.1` is the zip after MIT / public-ready README and the loopback-dev IWER inject gate. `v0.2.2` is chat follow + stop looping a finished turn, Quest card still while streaming, first-time provider setup line, and first-run pointing at the starter. |
| 16 | later | ship-02 — `sfab-bench app [dir]`, binary inside the `.app`, "Open at login". Not until the `.app` sits in `/Applications` and launches from the Dock |
| 17 | later | IWER in the packaged `.app`: confirm the zip does not ship or inject IWER; a future marketing-demo force-install must not leak into Quest LAN or the `.app`. |
| 18 | **done** | First-run: README + Welcome + user doc point at [sfab-bench-starter](https://github.com/sfab-oss/sfab-bench-starter), which vendors Jake `$cad` and a project Bench skill. No in-app clone. |
| 19 | **done** | Second domain ([ADR 0008](decisions/0008-second-domain.md)). A firmware image named `.<chip>.bin` is a document. First chip `esp32c3`. CAD and Device are separate screens. One running machine per document, shared by tabs and the agent. |
| 20 | **done** | Open a `.<chip>.bin` on esp-emu v0.43.0 (worker thread, checksum checked). The serial console docks under the board view, desktop only. The committed fixture is ESP-IDF v5.5.5 hello_world for the C3, and the selfcheck boots it to `Hello world!`. The binary is not in the `.app`. |
| 21 | **done** | Agent tools `get_device`, `run_firmware`, `read_serial`, `send_serial`. `get_device` is this tab, like `get_viewer`. The other three run on the server and share the one machine. |
| 22 | later | Real board. The server owns the serial port. Same four tools. |
| 23 | later | Telemetry lines bound to a CAD occurrence, shown on Quest. |
| 24 | dropped | MicroPython starter. The program we write is ESP-IDF C. The loader still opens any `*.esp32c3.bin`. |
| 25 | **done** | Device board view. An open `esp32c3` image shows a fixed ESP32-C3-DevKitM-1. Orbit, pan, zoom, and home. The console docks under it. No pin state. Quest stays CAD. |
| 26 | **done** | Device can show a source file read-only (C, headers, CMakeLists, sdkconfig). The app does not edit it and does not compile. |

## Do not build

Sign-in, a relay, a component registry, a mobile app, a
background service (Login Items is not one), thread-scoped cwd or a
thread sidebar as primary navigation, a diff or terminal panel, a
second tessellator, Tailscale integration, Fusion / CAD-tool integration,
Windows anything, merging sfab-cad, writing a chip emulator, a managed
firmware toolchain, a circuit editor. Row 20 vendors Espressif's
binary. It does not author a core.

Electron came off this list on 2026-09-14 by direct ask, as a shell only
([ADR 0005](decisions/0005-electron-shell.md)). A second UI inside it is
still not a thing we build.

`apps/docs` came off the “do not build a docs site” line on 2026-09-17 by
direct ask. It is a marketing worker (home page), not a second CAD UI
and not a second runbook. User steps stay in `docs/user/`. The hero
workbench is a desktop placeholder until we link `apps/web`.

## How to run

```bash
pnpm dev                      # server + Vite, use a browser
pnpm desktop                  # the same thing in an Electron window
pnpm cli open /abs/path --dev
```

Mac: `https://127.0.0.1:7322`. Quest: LAN host on port **7322**, pair
once. [`user/install.md`](user/install.md).
