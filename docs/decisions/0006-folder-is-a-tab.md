# ADR-0006: The folder is a tab's choice, not the process's

**Status:** Accepted
**Date:** 2026-09-14
**Deciders:** Alwurts

## Context

[ADR 0003](0003-library-not-viewport.md) shares recents, threads, and pairing
across every client of one process, and keeps viewport per tab. It also treated
the **open folder** as process-global: `projectPath()` was one value, `POST
/api/project` mutated it, and `hydrateSession` aborted whichever chat was
running. That is the wrong unit once two windows share a host — Electron
attaches to `pnpm dev` on `:7322`, so a Mac tab and an Electron window are
already two clients of one process. Opening bench-lab in one flipped the
other's catalog and killed its agent.

The server has no tab id: loopback is the constant `"loopback"`. Minting a
client map would break on reload. The folder has to travel on the request,
the same way `?file=` already names a document.

## Decision

**The folder a request is about is `?project=<abs path>`.**

- Loopback may name any directory; first use registers it into `projects`.
- Paired (and later account) clients may only name a folder already in recents.
- Omit the parameter and the request uses the process **fallback**:
  `SFAB_BENCH_PROJECT`, else the newest recent. That is today's boot default,
  so the unchanged web client keeps working.
- Recents, the thread list for a given folder, messages at rest, and pairing
  stay shared. Loaded file, selection, camera, XR, which chat is open, and the
  live stream stay per tab. `show_artifact` still moves only the asking client.
  Threads stay keyed by workspace. Thread-scoped cwd is not a thing here.

`409` is per workspace. Tessellation stays one worker. `resolveArtifact`
takes the request's root; it has no default.

### Compat hatch until sessions-02

`POST /api/project` still registers **and** sets the fallback, so today's
Open folder (which never sends `?project=`) still switches param-less clients.
It does not abort other workspaces' runs, and a request that already named
`?project=` is unaffected. Library WebSocket events are only broadcast for the
fallback folder, so a tessellation under `?project=` does not yank those tabs.
sessions-02 will put `?project=` on the page URL and stop treating POST as a
global switch.

## Consequences

### Positive
- Two folders can be live in one process without sharing a chat lock.
- The next client change is a query parameter, not a server-side session object.

### Negative
- Until sessions-02, two param-less windows still share the fallback.
- `POST /api/project` remains a fallback switch for old clients.

### Mitigations
- sessions-02: tab state is `?project=` beside `?file=`; the switcher sets the
  tab instead of POSTing; paired clients pick from recents; ⌘O targets that
  window's tab ([ADR 0005](0005-electron-shell.md) is otherwise unchanged).

## Implementation notes

- `apps/server/src/projects.ts` — map of root → watcher/revision; `resolveRequestRoot`.
- Hono sets `projectRoot` after the principal. Project-scoped routes read it.
- `session.ts` run mutex is keyed by root. `hydrateSession` does not abort.
- Selfchecks: two roots at once (`test:project`, `test:session`, `test:cad-pkg`).

## Related

- [0003-library-not-viewport](0003-library-not-viewport.md) — every line except process-global folder
- [0005-electron-shell](0005-electron-shell.md) — attach-to-dev is why two windows share a host
- [`product.md`](../product.md) — ranked sessions-01 / sessions-02
