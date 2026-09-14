# Desktop app

```bash
pnpm desktop
```

An Electron window that starts the server for you. No terminal to keep
open, and **Open…** is the real macOS folder chooser instead of
a typed path.

It is the same app the browser shows. The window loads
`https://127.0.0.1:7322` (Welcome). A paired Quest joins that origin, so
nothing can drift between the two ([ADR 0005](../decisions/0005-electron-shell.md)).

## Download

Collaborators can take `sfab-bench-<version>-arm64.app.zip` from
[GitHub Releases](https://github.com/sfab-oss/sfab-bench/releases). Unzip,
drag **sfab-bench** to Applications, double-click. Gatekeeper refuses the
first launch (ad-hoc signed, not notarised). Open **System Settings →
Privacy & Security**, scroll to Security, and press **Open Anyway** —
the button appears there for about an hour after the refusal. macOS
Sequoia removed the older Control-click → Open route, so that is now
the only way through. Then double-click again.

A friend without repo access gets the same zip by AirDrop.

## Things worth knowing

**It attaches to a server that is already running.** If `pnpm dev` is up
on `:7322`, `pnpm desktop` shows you that one, hot reload and all, and
leaves it running when you quit. Otherwise it starts its own and serves
`apps/web/dist`, which `pnpm desktop` rebuilds for you.

**Closing the window does not stop the server.** That is on purpose: a
paired Quest keeps working while the Mac window is shut. Quit (⌘Q) is
what stops it. Reopen the window from the Dock.

**⌘O** opens a folder in **this window**. Another tab or the Quest stays
where it is. It works with every window closed too: the new window opens
on `/?project=` for the folder you chose.

**The certificate.** The window trusts the self-signed certificate for
`https://127.0.0.1:7322` and nothing else.

**The window only ever shows that page.** It carries the preload that
exposes the folder chooser, so a link, or a file dropped on it, cannot
navigate it somewhere else. Links open in your normal browser instead.

## Building a `.app`

```bash
pnpm desktop:package
```

Writes `apps/desktop/release/mac-arm64/sfab-bench.app`, about 380 MB, with
the server, the OCCT kernel and the web client inside it, and
`apps/desktop/release/sfab-bench-<version>-arm64.app.zip` via `ditto
--keepParent` so the ad-hoc signature survives. Nothing else has to be
installed to run it. electron-builder drops `pnpm-lock.yaml` from
`node_modules`; `package.mjs` copies the harness bridge lockfiles back
in before signing, or Codex/OpenCode fail with ENOENT on first chat.

With `CSC_NAME` or `CSC_LINK` in the environment, the same command signs
with that identity. Notary credentials (`APPLE_ID`, app-specific password,
`APPLE_TEAM_ID`) also notarises. Without them it stays ad-hoc as above.
The ad-hoc signature is there because on Apple silicon an *invalid*
signature is worse than a missing one: the app simply refuses to launch,
with nothing to say why.

The icon comes from `apps/desktop/build/icon.icns`, generated from the
SFab mark by `apps/desktop/scripts/make_icon.mjs` and committed, so
packaging does not depend on having run it.
