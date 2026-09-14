# Install and run

Node 22.5 or newer. pnpm 11.

For a collaborator with Node:

```bash
git clone git@github.com:sfab-oss/sfab-bench.git && cd sfab-bench
pnpm install
pnpm desktop        # or: pnpm dev, then open https://127.0.0.1:7322
```

If you were handed `sfab-bench-<version>-arm64.app.zip` from
[Releases](https://github.com/sfab-oss/sfab-bench/releases) (you need access
to this private repo): unzip, drag **sfab-bench** to Applications,
double-click, then **System Settings → Privacy & Security → Open Anyway**,
and double-click again. The [Quest](quest.md) steps are unchanged.

`pnpm cli` is the developer name in the clone (`pnpm sfab-bench` is
the same binary). `npx sfab-bench` is not until this repo is public.

On the Mac, open `https://127.0.0.1:7322` and accept the self-signed
certificate. That tab is trusted (loopback). Do not use the LAN IP for
the Mac tab unless you intend to pair it as a guest.

State directory: `~/.sfab-bench/` (sqlite, cache, certs, managed tools).

| Env | Default | Purpose |
| --- | --- | --- |
| `SFAB_BENCH_PROJECT` | (none) | Folder to open on boot |
| `SFAB_BENCH_API_PORT` | `8787` | Dev API (loopback) |
| `SFAB_BENCH_PUBLIC_PORT` | `7322` | Vite / serve HTTPS port |

`pnpm build` also builds the desktop shell.
After it, `pnpm serve` is one HTTPS process on `:7322`.
`pnpm cli open <dir>` opens that folder and serves. `pnpm cli open <dir> --dev`
is the same with Vite. Both print Mac URL, Quest pair URL, pairing code, and QR.
