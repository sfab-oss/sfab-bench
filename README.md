# sfab-bench

Open a folder with a STEP in it and talk to it.

Quest Browser on the same Wi-Fi joins that Mac process over HTTPS. The
open folder, file recents, and thread history are shared. Each client
keeps its own loaded file, selection, camera, and live chat.

This is a CAD workbench that hosts the same class of agents T3 Code
hosts (Codex, Claude Code, Cursor, Grok, OpenCode) using logins already
on the machine. T3 is an inspiration, not a client or a host.

Living plan: [`docs/product.md`](docs/product.md).

## Run

Node 22.5+ and [pnpm](https://pnpm.io). From this directory:

```bash
pnpm install
pnpm dev
```

That starts a loopback API on `http://127.0.0.1:8787` and Vite HTTPS on
`:7322`, which proxies `/api`. Open `https://127.0.0.1:7322` on the Mac
(loopback is trusted). Click **Open folder**, pick a directory that
contains STEP or GLB files, then open one.

Optional: `SFAB_BENCH_PROJECT=/abs/path pnpm dev` opens that folder on
boot. Same thing as `pnpm cli open /abs/path --dev`. Otherwise the last
recent folder is restored, or the welcome screen if none.

`pnpm dev` and `pnpm serve` print the Mac URL, the Quest pair URL, a
6-character code, and a QR (fragment token in the scan URL).

Click **Enter Quest** in the Mac tab for the same join info in the UI.
Join URLs always use port **7322**.

On Quest 3: same Wi-Fi, Quest Browser, `https://<mac-ip>:7322/pair`,
accept the self-signed cert once, type the code. After that the headset
stores a device credential. Allow WebXR, then **Enter Studio**.

Production (one HTTPS process after `pnpm build`):

```bash
pnpm serve
pnpm cli open /abs/path
```

`npx` publish is later (this repo is private). Local CLI:

```bash
pnpm cli --help
pnpm cli open ~/Development/sphere-robot --dev
```

State lives under `~/.sfab-bench/` (sqlite, tessellation cache, certs).
The agent's cwd is the open folder.

More: [`docs/user/`](docs/user/).

## Tree

```text
apps/server     Node API, pairing, session, STEP loader, harness agents
apps/web        Vite + React + R3F desktop and Quest client
packages/contract   shared library / harness / snapshot types
docs/           architecture, ADRs, user runbook
.agents/skills/ how agents should use this viewer
```

`npx` install from npm is not this commit. Accounts and a public tunnel
are later. STEP is tessellated in-process by OpenCascade WASM — see
[`docs/decisions/0002-step-loader-occt.md`](docs/decisions/0002-step-loader-occt.md)
and [`0004`](docs/decisions/0004-occt-via-opencascade-js.md).
