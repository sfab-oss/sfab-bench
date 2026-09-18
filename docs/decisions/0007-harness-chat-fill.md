# ADR-0007: Harness chat is prompt, fill, or idle

**Status:** Accepted
**Date:** 2026-09-17
**Deciders:** Alwurts

## Context

Desktop and Quest chat used `useChat`'s `lastAssistantMessageIsCompleteWithToolCalls` to auto-POST after any finished host tool in the last step. That helper is for `streamText` client-side tools. Harness chat is sessionful: `show_artifact` already ran on the server in the same turn, then the session went idle. The client still resubmitted. The SDK correctly threw "no unfinished turn." We wrote that onto the same assistant message, the helper still matched, and Retry/`regenerate()` did the same POST. One Grok thread stored that error 958 times.

`get_viewer` and `askUserQuestions` have no server `execute`. They really do suspend the harness turn until the asking client answers.

## Decision

Continue from the live harness session, not from the last UI step.

- **prompt** — last message is the user. `agent.stream` with that text. Session may be created or resumed.
- **fill** — last message is not the user, and the process still holds an unfinished session for that thread. Submit the client tool result via `agent.stream` with the UI messages. Do not create a session to fill.
- **idle** — turn finished; session detached. A fill is HTTP 409 `no unfinished turn`. Do not call the harness. Retry replays the last user prompt.

`show_artifact` stays server-executed. It never triggers a fill. The client calls `sendMessage()` only after `addToolOutput` for `get_viewer` / `askUserQuestions`. It does not set `sendAutomaticallyWhen`.

Each stream ends with a `data-turn` part (`suspended` | `idle`) from `hasUnfinishedTurn()`.

## Consequences

### Positive
- Idle completed host tools cannot auto-continue.
- Retry cannot loop a fill 409.
- Client tools still exist; fill is that path.

### Negative
- Fill only works while the Node process still holds the session. A server restart mid-`get_viewer` 409s instead of continuing.

### Mitigations
- Keep the live handle in the Map until the turn is idle, as before.
- Map 409 copy so Retry is a new prompt, not another fill.

## Implementation notes

`apps/server/src/chat.ts`, `ChatSession.tsx`, `XrChatRuntime.tsx`, `useLiveViewerTools.ts`.

## Related

- [HarnessAgent UI](https://ai-sdk.dev/docs/ai-sdk-harnesses/ui) (session resume, no auto-continue helper)
- [Chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) (`lastAssistantMessageIsCompleteWithToolCalls` is the streamText pattern)
