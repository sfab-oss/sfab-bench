# Desktop app

```bash
pnpm desktop
```

An Electron window that starts the server for you. No terminal to keep
open, and **Choose folder…** is the real macOS folder chooser instead of
a typed path.

It is the same app the browser shows. The window loads
`https://127.0.0.1:7322`, which is also the page a paired Quest joins, so
nothing can drift between the two ([ADR 0005](../decisions/0005-electron-shell.md)).

## Things worth knowing

**It attaches to a server that is already running.** If `pnpm dev` is up
on `:7322`, `pnpm desktop` shows you that one, hot reload and all, and
leaves it running when you quit. Otherwise it starts its own and serves
`apps/web/dist` — run `pnpm build` first, or you will get the last build.

**Closing the window does not stop the server.** That is on purpose: a
paired Quest keeps working while the Mac window is shut. Quit (⌘Q) is
what stops it. Reopen the window from the Dock.

**⌘O** opens a folder from the menu, the same as the button.

**The certificate.** The window trusts the self-signed certificate for
`https://127.0.0.1:7322` and nothing else. External links open in your
normal browser.

## Building a `.app`

```bash
pnpm desktop:package
```

Writes `apps/desktop/release/mac-arm64/sfab-bench.app`, about 380 MB, with
the server, the OCCT kernel and the web client inside it. Nothing else has
to be installed to run it.

It is **unsigned**: the first time, right-click the app and choose Open,
then confirm. Signing and notarising need an Apple Developer identity this
repo does not have.
