import { DefaultChatTransport } from "ai";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { apiFetch, authHeaders } from "@/lib/api";
import { type Experience, experience } from "@/lib/experience";
import { store } from "@/state/store";

/** The next chat request continues a fill that started on this screen. */
let pinnedFill: Experience | null = null;

export function pinNextChatExperience(next: Experience) {
  pinnedFill = next;
}

export function viewerChatTransport(pinned?: Experience) {
  return new DefaultChatTransport({
    api: "/api/chat",
    fetch: apiFetch,
    headers: () => authHeaders(),
    body: () => {
      const filled = pinnedFill;
      pinnedFill = null;
      return {
        viewerFile: store.getState().url,
        viewer: viewerSnapshot(),
        experience: pinned ?? filled ?? experience(),
        harness: store.getState().chatHarness,
        model: store.getState().chatModel,
        effort: store.getState().chatEffort,
      };
    },
  });
}
