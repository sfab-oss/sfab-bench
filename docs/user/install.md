# Install and run

Node 22.5 or newer. pnpm 11.

```bash
git clone git@github.com:sfab-oss/sfab-bench.git
cd sfab-bench
pnpm install
pnpm dev
```

Or `pnpm desktop` for the [Electron window](desktop.md), which starts the
server itself and can open a folder with the native chooser.

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
