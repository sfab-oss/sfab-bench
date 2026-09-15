import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jsonApi } from "@/lib/api";
import { redact } from "@/lib/redact";

type SttSource = "settings" | "env" | null;

export function VoiceSection() {
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<SttSource>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () =>
    jsonApi.settings.stt.$get().then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { source?: SttSource };
      setSource(body.source ?? null);
    });

  useEffect(() => {
    void load();
  }, []);

  const save = (apiKey: string) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    void jsonApi.settings.stt
      .$put({ json: { apiKey } })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || res.statusText);
        }
        const body = (await res.json()) as { source?: SttSource };
        setSource(body.source ?? null);
        setDraft("");
        setSaved(true);
      })
      .catch((err: unknown) => {
        setError(redact(err instanceof Error ? err.message : String(err)));
      })
      .finally(() => setBusy(false));
  };

  if (source === "env") {
    return (
      <div className="space-y-2">
        <label htmlFor="stt-gateway-key" className="text-sm leading-snug">
          AI Gateway key for voice input (speech-to-text only — chat uses your provider logins)
        </label>
        <Input
          id="stt-gateway-key"
          autoComplete="off"
          disabled
          placeholder="••••••••"
          spellCheck={false}
          type="password"
          value=""
        />
        <p className="text-sm leading-snug text-muted-foreground">
          Set on the Mac via STT_AI_GATEWAY_API_KEY; restart to change.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="stt-gateway-key" className="text-sm leading-snug">
        AI Gateway key for voice input (speech-to-text only — chat uses your provider logins)
      </label>
      <Input
        id="stt-gateway-key"
        autoComplete="off"
        disabled={busy}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        placeholder={source ? "••••••••" : "AI Gateway key"}
        spellCheck={false}
        type="password"
        value={draft}
      />
      <div className="flex flex-wrap items-center gap-1">
        <Button
          className="h-7 px-2 text-xs"
          disabled={busy || !draft.trim()}
          onClick={() => save(draft)}
          size="sm"
          type="button"
        >
          Save
        </Button>
        {source === "settings" ? (
          <Button
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => save("")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
        ) : null}
        {saved ? (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
