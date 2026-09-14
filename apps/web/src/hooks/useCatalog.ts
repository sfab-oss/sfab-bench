import { useCallback, useEffect, useState } from "react";

import { jsonApi } from "@/lib/api";
import type { CatalogEntry } from "@/lib/viewer-snapshot";
import { useProjectSession } from "@/hooks/useProjectSession";

export function useCatalog(enabled = true) {
  const [files, setFiles] = useState<CatalogEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const projectPath = useProjectSession().project.path;
  const reload = useCallback(() => {
    if (!enabled || !projectPath) {
      setFiles([]);
      setRevision(0);
      setError(null);
      setReady(true);
      return;
    }
    setError(null);
    void jsonApi.catalog
      .$get()
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        return res.json() as Promise<{ files?: CatalogEntry[]; revision?: number }>;
      })
      .then((body) => {
        setFiles(body.files ?? []);
        setRevision(body.revision ?? 0);
        setError(null);
        setReady(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setReady(true);
      });
  }, [enabled, projectPath]);
  useEffect(() => {
    if (enabled && projectPath) setReady(false);
  }, [enabled, projectPath]);
  useEffect(() => {
    reload();
    const onProject = () => reload();
    window.addEventListener("sfab-project", onProject);
    return () => window.removeEventListener("sfab-project", onProject);
  }, [reload]);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(reload, 3000);
    return () => window.clearInterval(id);
  }, [enabled, reload]);
  return { files, revision, error, ready, reload };
}
