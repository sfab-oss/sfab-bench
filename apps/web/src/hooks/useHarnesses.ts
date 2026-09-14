import { useEffect, useState } from "react";

import { jsonApi } from "@/lib/api";
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

let cached: HarnessInfo[] | undefined;
let pending: Promise<HarnessInfo[]> | undefined;

export function loadHarnesses(): Promise<HarnessInfo[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = jsonApi.harnesses
      .$get()
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("harnesses"))))
      .then((body) => {
        const list = Array.isArray((body as { harnesses?: HarnessInfo[] }).harnesses)
          ? (body as { harnesses: HarnessInfo[] }).harnesses
          : [];
        cached = list;
        return list;
      })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}

export function useHarnesses() {
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>(cached ?? []);
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
  }, []);
  return { harnesses, ready, error };
}
