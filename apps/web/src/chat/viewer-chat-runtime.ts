import { DefaultChatTransport } from "ai";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { apiFetch, authHeaders } from "@/lib/api";
import { prefsStore } from "@/state/prefs";
import { viewerStore } from "@/state/viewer";

export function viewerChatTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    fetch: apiFetch,
    headers: () => authHeaders(),
    body: () => ({
      viewerFile: viewerStore.getState().url,
      viewer: viewerSnapshot(),
      harness: prefsStore.getState().chatHarness,
      model: prefsStore.getState().chatModel,
      effort: prefsStore.getState().chatEffort,
    }),
  });
}
