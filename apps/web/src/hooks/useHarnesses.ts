import { useCallback, useEffect, useState } from "react";

import { applyHarnessFetchResult, decideHarnessRefetch, type HarnessRefreshReason } from "@/chat/model-picker";
import { apiFetch } from "@/lib/api";
import { useProjectSession } from "@/hooks/useProjectSession";
import { projectUrl } from "@/lib/project-query";
import type { HarnessId } from "@/lib/harness";

export type HarnessStatus = "ready" | "missing-cli" | "needs-auth" | "error";

export type HarnessModel = { id: string; name: string; slug: string; group?: string };

export type HarnessInfo = {
  id: HarnessId;
  label: string;
  status: HarnessStatus;
  detail?: string;
  defaultModel: string;
  models: HarnessModel[];
};

export function harnessModelName(harnesses: HarnessInfo[], harness: HarnessId, slug: string): string {
  const hit = harnesses.find((h) => h.id === harness)?.models.find((m) => m.slug === slug);
  if (hit?.name.trim()) return hit.name.trim();
  const i = slug.lastIndexOf("/");
  return i >= 0 ? slug.slice(i + 1) : slug;
}

type CatalogCache = { project: string; list: HarnessInfo[] };

let lastGood: CatalogCache | undefined;
let inflight: { project: string; promise: Promise<HarnessInfo[]> } | undefined;
let lastStartedAt: number | null = null;
const listeners = new Set<() => void>();

function notifyHarnesses() {
  for (const listener of listeners) listener();
}

function parseHarnessList(body: unknown): HarnessInfo[] {
  return Array.isArray((body as { harnesses?: HarnessInfo[] }).harnesses)
    ? (body as { harnesses: HarnessInfo[] }).harnesses
    : [];
}

export function loadHarnesses(): Promise<HarnessInfo[]> {
  const project = projectUrl();
  if (!project) {
    lastGood = undefined;
    return Promise.resolve([]);
  }
  if (inflight && inflight.project === project) return inflight.promise;
  lastStartedAt = Date.now();
  const promise = apiFetch("/api/harnesses", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("harnesses"))))
    .then((body) => {
      const fetched = parseHarnessList(body);
      const applied = applyHarnessFetchResult({ ok: true, list: fetched, lastGood: lastGood?.list ?? null });
      lastGood = { project, list: applied.list };
      notifyHarnesses();
      return lastGood.list;
    })
    .catch((err) => {
      const applied = applyHarnessFetchResult({
        ok: false,
        lastGood: lastGood && lastGood.project === project ? lastGood.list : null,
      });
      notifyHarnesses();
      if (!applied.error) return applied.list;
      throw err;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = undefined;
    });
  inflight = { project, promise };
  return promise;
}

export function useHarnesses() {
  const project = useProjectSession().project.path;
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>(() =>
    lastGood && lastGood.project === projectUrl() ? lastGood.list : [],
  );
  const [ready, setReady] = useState(() => lastGood != null && lastGood.project === projectUrl());
  const [error, setError] = useState(false);

  const apply = useCallback((list: HarnessInfo[], failed: boolean) => {
    setHarnesses(list);
    setError(failed);
    setReady(true);
  }, []);

  const refresh = useCallback(
    (reason: HarnessRefreshReason = "retry") => {
      if (!project) {
        setHarnesses([]);
        setReady(true);
        setError(false);
        return;
      }
      const decision = decideHarnessRefetch({
        reason,
        now: Date.now(),
        lastStartedAt,
        inflight: Boolean(inflight && inflight.project === projectUrl()),
      });
      if (decision === "skip") return;
      void loadHarnesses()
        .then((list) => apply(list, false))
        .catch(() => {
          const fallback = lastGood && lastGood.project === projectUrl() ? lastGood.list : [];
          apply(fallback, fallback.length === 0);
        });
    },
    [apply, project],
  );

  useEffect(() => {
    refresh("mount");
    const onFocus = () => refresh("focus");
    window.addEventListener("focus", onFocus);
    const listener = () => {
      if (lastGood && lastGood.project === projectUrl()) {
        setHarnesses(lastGood.list);
        setError(false);
        setReady(true);
      }
    };
    listeners.add(listener);
    return () => {
      window.removeEventListener("focus", onFocus);
      listeners.delete(listener);
    };
  }, [project, refresh]);

  return { harnesses, ready, error, refresh };
}
