# AGENTS.md

Tier-1 entry point for anyone — human or AI agent — working in this repo.
Follow the links for detail.

## Project

**sfab-bench** — a CAD workbench: global server, open a folder, open a
STEP, talk. Quest Browser joins the same Mac process and shares the
library, not the live viewport. Private repo:
[sfab-oss/sfab-bench](https://github.com/sfab-oss/sfab-bench).

Living plan: [`docs/product.md`](docs/product.md). T3 Code is inspiration
only. Do not add accounts, a tunnel, or a second tessellator in this tree
without an ADR. The Electron shell is [ADR 0005](docs/decisions/0005-electron-shell.md)
— it wraps the server and the same page, and gains no UI of its own.

## Commands

Run from the **monorepo root**:

| Task | Command |
| --- | --- |
| Dev (API + Vite HTTPS) | `pnpm dev` |
| Desktop app (Electron) | `pnpm desktop` |
| Package a `.app` + Releases zip | `pnpm desktop:package` |
| Open a folder then serve | `pnpm cli open /abs/path` |
| Open a folder then Vite | `pnpm cli open /abs/path --dev` |
| Type check | `pnpm typecheck` |
| Self-checks | `pnpm test` |
| Production build | `pnpm build` |
| Serve dist + API | `pnpm serve` |

Mac tab: `https://127.0.0.1:7322`. Quest needs the LAN host, not loopback.

## Where things live

- **User runbook** → [`docs/user/`](docs/user/)
- **Product plan** → [`docs/product.md`](docs/product.md)
- **Architecture** → [`docs/architecture.md`](docs/architecture.md)
- **Testing criteria** → [`docs/testing.md`](docs/testing.md)
- **ADRs** → [`docs/decisions/`](docs/decisions/)
- **Working notes** → [`docs/notes/`](docs/notes/)
- **Server** → `apps/server/src/`
- **Web client** → `apps/web/src/`
- **Desktop shell** → `apps/desktop/src/`
- **Shared types** → `packages/contract/`
- **How agents use the viewer** → [`.agents/skills/sfab-bench/`](.agents/skills/sfab-bench/)

`.claude/CLAUDE.md` is a copy of this file. `.claude/skills/sfab-bench`
symlinks the skill above.

## Conventions

- Project = a directory. Document = a STEP or GLB in it. Agent cwd = that directory.
- Tessellation is a loader, not a project adapter. It is OCCT WASM in the API process, and the only one ([ADR 0002](docs/decisions/0002-step-loader-occt.md), [ADR 0004](docs/decisions/0004-occt-via-opencascade-js.md)).
- Loopback is trusted. Anything else on `/api` needs pairing.
- Electron is a shell: same server, same `https://127.0.0.1:7322` page, plus a native folder dialog. `apps/web` never imports from it ([ADR 0005](docs/decisions/0005-electron-shell.md)).
- Mac and Quest share recents and thread history. The folder is the tab's (`?project=`). Each client keeps its own file, selection, and live chat ([ADR 0003](docs/decisions/0003-library-not-viewport.md), [ADR 0006](docs/decisions/0006-folder-is-a-tab.md)).
- Do not merge `sfab-oss/sfab-cad` (cloud + Godot). That choice is [ADR 0001](docs/decisions/0001-new-private-repo.md).
- Do not commit machine-specific home paths or usernames. CLI examples use `/abs/path`.
