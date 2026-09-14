# Providers

sfab-bench does not hold provider credentials. It drives CLIs already
logged in on the Mac: OpenCode, Codex, Cursor, Grok.

Pick harness, model, and effort in the chat header. Those prefs live on
the shared thread, not in the browser.

OpenCode model lists come from the `opencode` binary (PATH, or
`.harness-bootstrap` inside the open project). If nothing is connected,
the picker still shows static defaults.

Voice input posts to `/api/transcribe` through AI Gateway. Set
`AI_GATEWAY_API_KEY` on the Mac before `pnpm dev`. Optional: `STT_MODEL`
(default `openai/whisper-1`). Restart after adding the key.
