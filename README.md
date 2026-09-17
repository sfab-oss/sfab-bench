# sfab-bench

<img src="apps/web/public/favicon.svg" width="32" height="32" alt="SFab" />

A CAD workbench for the Mac. Open a folder, open a STEP, talk to it with the AI subscriptions already on the machine (Codex, Claude Code, Grok, OpenCode). Quest Browser on the same Wi-Fi joins that process.

Site: [bench.sfab.ai](https://bench.sfab.ai)

## Run

**Mac app.** Unzip `sfab-bench-<version>-arm64.app.zip` from
[Releases](https://github.com/sfab-oss/sfab-bench/releases), drag it to
Applications, then **System Settings → Privacy & Security → Open Anyway**.
Ad-hoc signed, not notarised yet. Details: [`docs/user/install.md`](docs/user/install.md).

**From this clone.** Node 22.5+ and [pnpm](https://pnpm.io):

```bash
pnpm install
pnpm desktop        # or: pnpm dev, then https://127.0.0.1:7322
```

`pnpm dev` starts a loopback API on `http://127.0.0.1:8787` and Vite HTTPS
on `:7322`. Open a folder that contains STEP or GLB files, then open one.

Quest 3: same Wi-Fi, Quest Browser, pair once at `https://<mac-ip>:7322/pair`.
Join URLs always use port **7322**. [`docs/user/quest.md`](docs/user/quest.md).

State lives under `~/.sfab-bench/`. The agent's cwd is the open folder.

More: [`docs/user/`](docs/user/). Living plan: [`docs/product.md`](docs/product.md).

## Tree

```text
apps/server     Node API, pairing, session, STEP loader, harness agents
apps/web        Vite + React + R3F desktop and Quest client
apps/desktop    Electron shell: starts the server, native folder dialog
apps/docs       Product home (bench.sfab.ai)
packages/contract   shared library / harness / snapshot types
docs/           architecture, ADRs, user runbook
.agents/skills/ how agents should use this viewer
```

`npx sfab-bench` is not published yet. `pnpm desktop` runs the whole thing in
an Electron window. STEP is tessellated in-process by OpenCascade WASM —
[`docs/decisions/0002-step-loader-occt.md`](docs/decisions/0002-step-loader-occt.md)
and [`0004`](docs/decisions/0004-occt-via-opencascade-js.md).

MIT. See [`LICENSE`](LICENSE).
