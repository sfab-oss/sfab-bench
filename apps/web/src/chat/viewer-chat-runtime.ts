import { DefaultChatTransport } from "ai";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { authHeaders } from "@/lib/api";
import { store } from "@/state/store";

export function viewerChatTransport() {
  return new DefaultChatTransport({
    api: "/api/chat",
    headers: () => authHeaders(),
    body: () => ({
      viewerFile: store.getState().url,
      viewer: viewerSnapshot(),
      harness: store.getState().chatHarness,
      model: store.getState().chatModel,
      effort: store.getState().chatEffort,
    }),
  });
}
