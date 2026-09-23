import { useEffect, useState } from "react";

import { jsonApi } from "@/lib/api";

/** Read-only source. The file is not edited here, and nothing is compiled. */
export function SourceView({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    void jsonApi.project.source
      .$get({ query: { path } })
      .then(async (res) => {
        const body = (await res.json()) as { text?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || typeof body.text !== "string") {
          setError(body.error ?? "Could not read that file");
          return;
        }
        setText(body.text);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read that file");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
        {path}
      </div>
      {error ? (
        <p className="px-4 py-3 text-sm text-error">{error}</p>
      ) : text === null ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Reading…</p>
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-5 text-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}
