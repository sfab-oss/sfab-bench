import { useCallback, useEffect, useState } from "react";

import {
  applyHarnessFetchResult,
  decideHarnessRefetch,
  shouldAcceptHarnessCatalog,
  type HarnessRefreshReason,
} from "@/chat/model-picker";
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

const lastGoodByProject = new Map<string, HarnessInfo[]>();
const inflightByProject = new Map<string, Promise<HarnessInfo[]>>();
const lastStartedAtByProject = new Map<string, number>();
const listeners = new Set<() => void>();
// Tabs can wander through many folders; keep the most recent ones only.
const MAX_CACHED_PROJECTS = 20;

function rememberProject<T>(map: Map<string, T>, project: string, value: T) {
  map.delete(project);
  map.set(project, value);
  while (map.size > MAX_CACHED_PROJECTS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

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
  if (!project) return Promise.resolve([]);
  const pending = inflightByProject.get(project);
  if (pending) return pending;
  rememberProject(lastStartedAtByProject, project, Date.now());
  const promise = apiFetch("/api/harnesses", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("harnesses"))))
    .then((body) => {
      const fetched = parseHarnessList(body);
      const applied = applyHarnessFetchResult({
        ok: true,
        list: fetched,
        lastGood: lastGoodByProject.get(project) ?? null,
      });
      rememberProject(lastGoodByProject, project, applied.list);
      if (shouldAcceptHarnessCatalog(project, projectUrl())) notifyHarnesses();
      return applied.list;
    })
    .catch((err) => {
      const applied = applyHarnessFetchResult({
        ok: false,
        lastGood: lastGoodByProject.get(project) ?? null,
      });
      if (!applied.error) rememberProject(lastGoodByProject, project, applied.list);
      if (shouldAcceptHarnessCatalog(project, projectUrl())) notifyHarnesses();
      if (!applied.error) return applied.list;
      throw err;
    })
    .finally(() => {
      if (inflightByProject.get(project) === promise) inflightByProject.delete(project);
    });
  inflightByProject.set(project, promise);
  return promise;
}

export function useHarnesses() {
  const project = useProjectSession().project.path;
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>(() => lastGoodByProject.get(projectUrl()) ?? []);
  const [ready, setReady] = useState(() => lastGoodByProject.has(projectUrl()));
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
        lastStartedAt: lastStartedAtByProject.get(project) ?? null,
        inflight: inflightByProject.has(project),
      });
      if (decision === "skip") return;
      void loadHarnesses()
        .then((list) => {
          if (!shouldAcceptHarnessCatalog(project, projectUrl())) return;
          apply(list, false);
        })
        .catch(() => {
          if (!shouldAcceptHarnessCatalog(project, projectUrl())) return;
          const fallback = lastGoodByProject.get(project) ?? [];
          apply(fallback, fallback.length === 0);
        });
    },
    [apply, project],
  );

  useEffect(() => {
    let cancelled = false;
    const cached = project ? lastGoodByProject.get(project) : undefined;
    if (!project) {
      setHarnesses([]);
      setReady(true);
      setError(false);
    } else if (cached) {
      setHarnesses(cached);
      setError(false);
      setReady(true);
    } else {
      setHarnesses([]);
      setReady(false);
      setError(false);
    }
    refresh("mount");
    const onFocus = () => {
      if (!cancelled) refresh("focus");
    };
    window.addEventListener("focus", onFocus);
    const listener = () => {
      if (cancelled) return;
      if (!shouldAcceptHarnessCatalog(project, projectUrl())) return;
      const list = lastGoodByProject.get(project);
      if (!list) return;
      setHarnesses(list);
      setError(false);
      setReady(true);
    };
    listeners.add(listener);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      listeners.delete(listener);
    };
  }, [project, refresh]);

  return { harnesses, ready, error, refresh };
}
