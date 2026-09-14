import { useEffect, useState } from "react";

import { jsonApi } from "@/lib/api";
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

let cached: { project: string; list: HarnessInfo[] } | undefined;
let pending: { project: string; promise: Promise<HarnessInfo[]> } | undefined;

export function loadHarnesses(): Promise<HarnessInfo[]> {
  const project = projectUrl();
  if (cached && cached.project === project) return Promise.resolve(cached.list);
  if (pending && pending.project === project) return pending.promise;
  const promise = jsonApi.harnesses
    .$get()
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("harnesses"))))
    .then((body) => {
      const list = Array.isArray((body as { harnesses?: HarnessInfo[] }).harnesses)
        ? (body as { harnesses: HarnessInfo[] }).harnesses
        : [];
      cached = { project, list };
      return list;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
  pending = { project, promise };
  return promise;
}

export function useHarnesses() {
  const project = useProjectSession().project.path;
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>(cached?.list ?? []);
  const [ready, setReady] = useState(cached != null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadHarnesses()
      .then((list) => {
        if (cancelled) return;
        setHarnesses(list);
        setError(false);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHarnesses([]);
          setError(true);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project]);
  return { harnesses, ready, error };
}
