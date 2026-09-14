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
`apps/web/dist`, which `pnpm desktop` rebuilds for you.

**Closing the window does not stop the server.** That is on purpose: a
paired Quest keeps working while the Mac window is shut. Quit (⌘Q) is
what stops it. Reopen the window from the Dock.

**⌘O** opens a folder from the menu, the same as the button. It works
with every window closed too, and opens one showing the folder you chose.

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
the server, the OCCT kernel and the web client inside it. Nothing else has
to be installed to run it.

It is **ad-hoc signed**, not notarised: the first time, right-click the app
and choose Open, then confirm. Gatekeeper will say it cannot check it for
malicious software, which is true — proper signing and notarising need an
Apple Developer identity this repo does not have. The ad-hoc signature is
there because on Apple silicon an *invalid* signature is worse than a
missing one: the app simply refuses to launch, with nothing to say why.
