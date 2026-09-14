# Product

Living plan for this repo. Architecture detail is
[`architecture.md`](architecture.md). Expensive calls are
[`decisions/`](decisions/). How to run it is [`user/`](user/).

The 2026-09-13 Fable survey that produced this direction still lives in
sphere-robot as historical analysis
([`cad-app-product.md`](https://github.com/Alwurts/sphere-robot/blob/main/docs/analysis/cad-app-product.md)).
**This file is the source of truth for what we are building next.**

## What this is

A CAD workbench that hosts the same class of agents T3 Code hosts
(Codex, Claude Code, Cursor, Grok, OpenCode), using logins already on
the Mac. T3 is inspiration for install, pairing, and provider handling.
T3 is never a client or a host of this app.

Three jobs, kept separate:

| Job | Who |
| --- | --- |
| **Authoring** | Whatever produced the STEP in the open folder (Jake cadgen, Fusion export, a human, …). This app does not author. |
| **Presence** | The viewer: tessellated package, tree, selection, measure, Quest world. This is the product. |
| **Agent host** | This Node process: open folder, harnesses, threads, `get_viewer` / `show_artifact`. |

North star: global server → **open a folder** → **open a STEP** → talk.
Quest Browser joins over HTTPS and shares the **library**, not the live
viewport ([ADR 0003](decisions/0003-library-not-viewport.md)).

## Locked

Do not re-open these unless the human asks.

- **No adapters.** Project = a directory. Document = a STEP or GLB in it. Agent cwd = that directory. Skills live in the project if the user put them there.
- **Tessellation is a loader**, not an adapter. Cadgen is stopgap. Destination is our OpenCascade WASM tessellator, same `assembly.json` + `.tess` + `#o…` contract ([ADR 0002](decisions/0002-step-loader-occt.md)).
- **One process, two HTTPS clients.** Mac tab (loopback trusted) and Quest Browser (paired). No Unity, no APK.
- **Share the library, not the viewport.** Recents, thread list, messages at rest, open folder, pairing. Not: loaded file, selection, camera, XR, which chat is open, live stream. `show_artifact` moves only the asking client.
- **Desktop composer stays TipTap** for future `#` chips (parts, faces, `#o…`). Quest stays plain input + voice.
- **Electron later.** v0 is this Node server + system browser. A web page cannot give the server a real folder path; typed path / `pnpm cli open` is the v0 picker.
- **Auth now is pairing.** Accounts are a later `principal.kind`. Never hold provider credentials; show the login command in the UI.
- **Do not merge** [`sfab-oss/sfab-cad`](https://github.com/sfab-oss/sfab-cad) ([ADR 0001](decisions/0001-new-private-repo.md)).
- Sphere-robot is a **folder you open**, not the app.

## Ranked next

Each row is one PR-sized unit. Update status here when it ships.

| # | Status | Item |
| --- | --- | --- |
| 1 | **done** | Pairing: loopback trusted, LAN needs a device token |
| 2 | **done** | Standalone Node server; Vite proxies `/api` in dev |
| 3 | **done** | Project folder + managed cadgen loader + recents |
| 4 | **done** | Library, not viewport ([ADR 0003](decisions/0003-library-not-viewport.md)) |
| 5 | **done** | This repo; sphere-robot `xr-viewer/` deleted |
| 6 | **partial** | Desktop layout (files left, model tree on canvas, chat right, provider status). **Still to do:** TipTap `#` mentions from parts / faces / `#o…`; chips flatten to those refs; click-in-history selects on this tab |
| 7 | **partial** | Local CLI (`pnpm cli serve` / `dev` / `open`) prints URL, QR, pairing code. **Not** public `npx` (repo is private) |
| 8 | later | `--tunnel` (pairing already required for non-loopback). Do not start until someone needs Quest off this LAN |
| 9 | later | Docs app (`apps/docs`, `llms.txt`). After a public install path, not before |
| 10 | later | Electron (native folder dialog, keep-alive). After 8 has been used by someone else |
| 11 | later | Account `principal.kind`. Only when 8 is used by more than one person |
| — | later | OCCT WASM loader. Do not start while 6’s TipTap mentions are open |

## Do not build

Electron, sign-in, a relay, a component registry, a docs site, a mobile
app, a background service, multi-project sessions, a diff or terminal
panel, a second tessellator, Tailscale integration, Fusion / CAD-tool
integration, Windows anything, merging sfab-cad.

## How to run

```bash
pnpm dev
pnpm cli open /abs/path --dev
```

Mac: `https://127.0.0.1:7322`. Quest: LAN host on port **7322**, pair
once. [`user/install.md`](user/install.md).
