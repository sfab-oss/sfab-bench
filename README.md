# sfab-bench

CAD on your Mac. Talk to it with the AI you already pay for.

Open a folder, open a STEP, talk with Codex, Claude Code, Grok, or OpenCode
already on the machine. This app does not take API keys for chat. Quest
Browser on the same Wi-Fi joins that process.

[bench.sfab.ai](https://bench.sfab.ai) · [Download](https://github.com/sfab-oss/sfab-bench/releases)

## Install

Unzip `sfab-bench-<version>-arm64.app.zip` from
[Releases](https://github.com/sfab-oss/sfab-bench/releases), drag it to
Applications, then **System Settings → Privacy & Security → Open Anyway**.
Ad-hoc signed, not notarised yet.

From a clone (Node 22.5+, [pnpm](https://pnpm.io)):

```bash
pnpm install
pnpm desktop
```

Quest: same Wi-Fi, Quest Browser, pair once. Details:
[`docs/user/`](docs/user/).

## Layout

```text
apps/desktop    Electron shell (folder dialog, starts the server)
apps/web        Mac and Quest client
apps/server     API, pairing, STEP loader, harness agents
apps/docs       Product home
```

MIT. See [`LICENSE`](LICENSE).
