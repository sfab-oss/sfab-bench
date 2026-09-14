import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMe } from "@/lib/api";
import { redeemPairing } from "@/lib/pairing";

function goHome() {
  window.history.replaceState(null, "", "/" + window.location.search);
}

export function PairPage({ onPaired }: { onPaired?: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    void fetchMe().then((me) => {
      if (me) setPaired(true);
    });
  }, []);

  const submit = async (value: string) => {
    const compact = value.replace(/[^A-Za-z0-9]/g, "");
    if (compact.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemPairing({ code: compact });
      goHome();
      onPaired?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
      setBusy(false);
    }
  };

  if (paired) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-900">This device is paired</h1>
          <p className="mt-2 text-sm text-zinc-500">You can open the viewer.</p>
          <Button className="mt-5 w-full" onClick={() => { goHome(); onPaired?.(); }}>
            Open viewer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6">
      <form
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit(code);
        }}
      >
        <h1 className="text-lg font-semibold text-zinc-900">Enter pairing code</h1>
        <p className="mt-2 text-sm text-zinc-500">Type the 6-character code shown on the Mac. On the Mac, keep sfab-bench at https://127.0.0.1:7322 and click Enter Quest.</p>
        <Input
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          value={code}
          disabled={busy}
          onChange={(ev) => {
            const next = ev.target.value.toUpperCase();
            setCode(next);
            if (next.replace(/\s/g, "").length >= 6) void submit(next);
          }}
          placeholder="K7MP2Q"
          className="mt-5 h-14 text-center font-mono text-2xl tracking-[0.35em]"
        />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="mt-5 w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
          {busy ? "Pairing…" : "Pair"}
        </Button>
      </form>
    </div>
  );
}
