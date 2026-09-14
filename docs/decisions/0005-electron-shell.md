# ADR-0005: Electron is a shell around the same server and the same page

**Status:** Accepted
**Date:** 2026-09-14
**Deciders:** Alwurts

## Context

v0 was a Node server plus the system browser, and
[`product.md`](../product.md) kept Electron on the "later" list behind the
tunnel. The reason to move it up is the one thing the browser genuinely cannot
do: a web page cannot hand the server a real folder path. Until now the picker
was a typed path, `pnpm cli open`, or an in-app directory browser the server
had to implement — three workarounds for a missing native dialog. A desktop
shell also means the server starts when the app starts, instead of a terminal
someone has to keep open.

The risk with Electron is that it quietly becomes a second product: its own
window chrome, its own routes, its own copy of the UI, and a Quest that sees
something different from the Mac.

## Decision

`apps/desktop` is a **shell**, not a client. It:

- starts the existing API in an Electron `utilityProcess` and loads
  `https://127.0.0.1:7322` — the same origin the browser tab and the Quest use.
  There is no second UI, no `file://` page and no renderer-side Node.
- **attaches** to a server already on that port instead of failing, so a
  running `pnpm dev` becomes the window's contents, hot reload included.
- adds exactly one capability through a `contextBridge` preload:
  `window.sfabBench.pickFolder()`. The web app feature-detects it and keeps the
  typed path for Chrome and Quest.
- keeps the server up when the window closes on macOS. Quitting stops it. A
  paired Quest does not lose its server because someone hit the red button.

The API runs in a utility process rather than in main because tessellating an
11 MB STEP is about ten seconds of wasm, and in the main process that is ten
seconds of frozen window.

## Consequences

### Positive
- A native folder dialog, and one process to launch instead of a terminal.
- One page, one origin, one build. Mac and Quest cannot drift, because there is
  nothing to drift.
- Anything Electron adds later (tray, deep links, updates) lands in the shell,
  not in the viewer.

### Negative
- A second runtime to keep current, and a packaging story that has to carry a
  66 MB wasm and a pnpm workspace.
- Electron's main process gets its own HTTPS quirk: Chromium's `fetch` rejects
  our self-signed certificate with no hook to override it, so the shell talks
  to the API over `node:https` with verification off — loopback only, and a
  certificate we generated ourselves.

### Mitigations
- The shell is ~200 lines and holds no product logic. Deleting it leaves the
  browser path exactly as it was.
- `apps/web` never imports from `apps/desktop`; it feature-detects a global.
  The web build runs unchanged in Chrome and on Quest.

## Implementation notes

- `src/main.ts` — server lifecycle, window, menu, folder dialog.
- `src/preload.ts` — the `window.sfabBench` bridge, and nothing else.
- `build.mjs` — esbuild: main and preload to `apps/desktop/dist`, the API to
  `apps/server/dist/api.mjs` (it has to sit beside the node_modules it needs).
- `pnpm desktop` builds and runs it.

## Related

- [0003-library-not-viewport](0003-library-not-viewport.md) — why one origin for both clients
- [0004-occt-via-opencascade-js](0004-occt-via-opencascade-js.md) — the wasm packaging has to carry
- [`product.md`](../product.md) — Electron moved off "later" by direct ask, 2026-09-14
