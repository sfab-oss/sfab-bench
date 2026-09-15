import { Headset, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { AppearancePicker } from "@/components/theme/theme-toggle";
import { QuestJoinPanel } from "@/components/QuestJoinPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { jsonApi } from "@/lib/api";

type SttSource = "settings" | "env" | null;

function VoiceKeyFields() {
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<SttSource>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBusy(false));
  };

  const hint =
    source === "settings"
      ? "Saved on this Mac."
      : source === "env"
        ? "Using an env var on this Mac."
        : "Needed for the mic. Chat still uses Mac logins.";

  return (
    <div className="space-y-1.5 px-1">
      <div className="text-xs font-medium text-muted-foreground">Voice</div>
      <Input
        autoComplete="off"
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={source ? "••••••••" : "AI Gateway key"}
        spellCheck={false}
        type="password"
        value={draft}
      />
      <div className="flex gap-1">
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
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

export function WorkbenchSettings({ host }: { host: boolean }) {
  const [questOpen, setQuestOpen] = useState(false);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover>
            <PopoverTrigger render={<SidebarMenuButton />}>
              <Settings />
              Settings
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-72 p-2">
              <div className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Appearance</div>
              <AppearancePicker />
              {host ? (
                <>
                  <Separator className="my-2" />
                  <VoiceKeyFields />
                  <Separator className="my-2" />
                  <PopoverClose
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    onClick={() => setQuestOpen(true)}
                  >
                    <Headset className="size-4 shrink-0" />
                    Enter Quest
                  </PopoverClose>
                </>
              ) : null}
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
      {host ? <QuestJoinPanel open={questOpen} onOpenChange={setQuestOpen} showTrigger={false} /> : null}
    </>
  );
}
