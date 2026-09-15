# Providers

sfab-bench does not hold provider credentials. It drives CLIs already
logged in on the Mac: OpenCode, Codex, Cursor, Grok.

Pick harness, model, and effort in the composer. Those prefs live on
the shared thread, not in the browser. If the selected harness is not
signed in, the composer shows the CLI to run on the Mac (`agent login`,
`codex login`, `grok login`, or OpenCode install).

OpenCode model lists come from the `opencode` binary (PATH,
`~/.opencode/bin`, Homebrew, `~/.sfab-bench/tools/opencode`, or the
per-folder bootstrap under `~/.sfab-bench/harness/`). A Dock-launched
`.app` does not inherit your terminal PATH, so the server prepends those
usual locations. If nothing is connected, the picker still shows static
defaults. Codex and OpenCode also need `pnpm` on that same PATH to install
their bootstrap into `~/.sfab-bench/harness/` (not the CAD folder).

Voice input posts to `/api/transcribe` through AI Gateway. Set
`AI_GATEWAY_API_KEY` on the Mac before `pnpm dev`. Optional: `STT_MODEL`
(default `openai/whisper-1`). Restart after adding the key.
