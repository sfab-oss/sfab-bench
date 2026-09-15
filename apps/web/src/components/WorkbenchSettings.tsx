import { Headset, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { loginCommandFromStatus } from "@/chat/model-picker";
import { QuestJoinPanel } from "@/components/QuestJoinPanel";
import { useAppearancePrefs } from "@/components/theme/appearance-prefs";
import { AppearancePicker } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { CommandBlock } from "@/components/ui/command-block";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useHarnesses, type HarnessInfo } from "@/hooks/useHarnesses";
import { useProjectSession } from "@/hooks/useProjectSession";
import { jsonApi } from "@/lib/api";
import { APP_DISPLAY_NAME, APP_VERSION } from "@/lib/crash-report";
import { isMacPlatform } from "@/lib/files-rail";
import { folderName } from "@/lib/project";
import { redact } from "@/lib/redact";
import {
  CONTRAST_DEFAULT,
  CONTRAST_MAX,
  CONTRAST_MIN,
  SETTINGS_SHORTCUTS,
  formatDebugReport,
  formatShortcutChips,
  harnessStatusLabel,
  type TextSize,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

type SttSource = "settings" | "env" | null;
type SettingsSectionId = "appearance" | "voice" | "providers" | "shortcuts" | "about";
type CopyFlash = "copied" | "failed" | null;

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

function AppearanceSection() {
  const { contrast, textSize, setContrast, setTextSize, resetContrast, resetTextSize } = useAppearancePrefs();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Theme</div>
        <AppearancePicker />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="appearance-contrast" className="text-sm font-medium">
            Contrast
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={contrast === CONTRAST_DEFAULT}
            onClick={resetContrast}
          >
            Reset
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <output
            htmlFor="appearance-contrast"
            className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs tabular-nums"
          >
            {contrast}%
          </output>
          <input
            id="appearance-contrast"
            aria-label="Contrast"
            className="min-w-0 flex-1 accent-foreground"
            max={CONTRAST_MAX}
            min={CONTRAST_MIN}
            onChange={(event) => setContrast(Number(event.currentTarget.value))}
            step={5}
            type="range"
            value={contrast}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Interface text size</div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={textSize === "default"}
            onClick={resetTextSize}
          >
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {TEXT_SIZES.map((size) => (
            <Button
              key={size.value}
              type="button"
              size="sm"
              variant={textSize === size.value ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setTextSize(size.value)}
            >
              {size.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoiceKeyFields() {
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

function statusDotClass(status: string): string {
  if (status === "ready") return "bg-emerald-500";
  if (status === "needs-auth") return "bg-amber-500";
  if (status === "missing-cli") return "bg-destructive";
  return "bg-muted-foreground";
}

function ProviderRow({ info, onCheckAgain }: { info: HarnessInfo; onCheckAgain: () => void }) {
  const ready = info.status === "ready";
  const command = loginCommandFromStatus(info);
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(info.status))} />
          <span className="truncate text-sm font-medium">{info.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{harnessStatusLabel(info.status)}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onCheckAgain}
        >
          Check again
        </Button>
      </div>
      {ready || (!command && !info.detail) ? null : (
        <div className="space-y-1.5">
          {command ? <CommandBlock command={command} /> : null}
          {info.detail ? <p className="text-xs text-muted-foreground">{info.detail}</p> : null}
        </div>
      )}
    </div>
  );
}

function ProvidersSection() {
  const { harnesses, ready, error, refresh } = useHarnesses();
  if (!ready && harnesses.length === 0) {
    return <p className="text-sm text-muted-foreground">Checking providers…</p>;
  }
  if (error && harnesses.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load providers.</p>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => refresh("retry")}>
          Check again
        </Button>
      </div>
    );
  }
  if (harnesses.length === 0) {
    return <p className="text-sm text-muted-foreground">Open a folder to see providers.</p>;
  }
  return (
    <div className="space-y-2">
      {harnesses.map((info) => (
        <ProviderRow key={info.id} info={info} onCheckAgain={() => refresh("retry")} />
      ))}
    </div>
  );
}

function ShortcutsSection() {
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
  return (
    <ul className="space-y-2">
      {SETTINGS_SHORTCUTS.map((row) => (
        <li key={row.action} className="flex items-center justify-between gap-3">
          <span className="text-sm">{row.action}</span>
          <span className="flex shrink-0 items-center gap-1">
            {formatShortcutChips(row.keys, mac).map((chip, index) => (
              <Kbd key={`${row.action}-${chip}-${index}`}>{chip}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AboutSection({ host }: { host: boolean }) {
  const { theme } = useTheme();
  const { contrast, textSize } = useAppearancePrefs();
  const projectPath = useProjectSession().project.path;
  const title = useStore((s) => s.title);
  const error = useStore((s) => s.error);
  const { harnesses } = useHarnesses();
  const [flash, setFlash] = useState<CopyFlash>(null);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const copyReport = () => {
    const text = formatDebugReport({
      appName: APP_DISPLAY_NAME,
      version: APP_VERSION,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      principalKind: host ? "loopback" : "paired",
      folderName: projectPath ? folderName(projectPath) : null,
      fileBasename: title && title !== "No model" ? title : null,
      projectPath,
      harnesses: harnesses.map((row) => ({ label: row.label, status: row.status })),
      theme,
      contrast,
      textSize,
      loadError: error,
    });
    void navigator.clipboard.writeText(text).then(
      () => setFlash("copied"),
      () => setFlash("failed"),
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">{APP_DISPLAY_NAME}</div>
        <div className="font-mono text-xs text-muted-foreground">{APP_VERSION}</div>
      </div>
      <Button type="button" size="sm" variant="secondary" className="h-8" onClick={copyReport}>
        {flash === "copied" ? "Copied" : flash === "failed" ? "Couldn't copy" : "Copy debug report"}
      </Button>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-sm font-medium sm:sr-only">{children}</h2>;
}

export function WorkbenchSettings({ host }: { host: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [pendingQuest, setPendingQuest] = useState(false);
  const [section, setSection] = useState<SettingsSectionId>("appearance");

  useEffect(() => {
    if (settingsOpen || !pendingQuest) return;
    setPendingQuest(false);
    setQuestOpen(true);
  }, [pendingQuest, settingsOpen]);

  const sections: { id: SettingsSectionId; label: string; hostOnly?: boolean }[] = [
    { id: "appearance", label: "Appearance" },
    { id: "voice", label: "Voice", hostOnly: true },
    { id: "providers", label: "Providers" },
    { id: "shortcuts", label: "Shortcuts" },
    { id: "about", label: "About" },
  ];
  const visible = sections.filter((row) => (row.hostOnly ? host : true));

  const pane = (id: SettingsSectionId) => {
    const active = section === id;
    return cn(active ? "block" : "max-sm:block sm:hidden");
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Dialog
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (open) setSection("appearance");
            }}
          >
            <DialogTrigger render={<SidebarMenuButton />}>
              <Settings />
              Settings
            </DialogTrigger>
            <DialogContent className="flex h-[min(40rem,calc(100dvh-2rem))] max-h-[min(40rem,calc(100dvh-2rem))] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 pr-10">
                <DialogTitle className="pr-0">Settings</DialogTitle>
              </div>
              <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <nav
                  aria-label="Settings sections"
                  className="hidden shrink-0 flex-col gap-0.5 border-border p-2 sm:flex sm:w-44 sm:border-r"
                >
                  {visible.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      aria-current={section === row.id ? "page" : undefined}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-left text-sm",
                        section === row.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/70",
                      )}
                      onClick={() => setSection(row.id)}
                    >
                      {row.label}
                    </button>
                  ))}
                </nav>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <section className={pane("appearance")}>
                    <SectionHeading>Appearance</SectionHeading>
                    <AppearanceSection />
                  </section>
                  {host ? (
                    <section className={cn("max-sm:mt-6", pane("voice"))}>
                      <SectionHeading>Voice</SectionHeading>
                      <VoiceKeyFields />
                    </section>
                  ) : null}
                  <section className={cn("max-sm:mt-6", pane("providers"))}>
                    <SectionHeading>Providers</SectionHeading>
                    <ProvidersSection />
                  </section>
                  <section className={cn("max-sm:mt-6", pane("shortcuts"))}>
                    <SectionHeading>Shortcuts</SectionHeading>
                    <ShortcutsSection />
                  </section>
                  <section className={cn("max-sm:mt-6", pane("about"))}>
                    <SectionHeading>About</SectionHeading>
                    <AboutSection host={host} />
                  </section>
                </div>
              </div>
              {host ? (
                <div className="border-t border-border px-4 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => {
                      setPendingQuest(true);
                      setSettingsOpen(false);
                    }}
                  >
                    <Headset />
                    Enter Quest
                  </Button>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </SidebarMenuItem>
      </SidebarMenu>
      {host ? <QuestJoinPanel open={questOpen} onOpenChange={setQuestOpen} showTrigger={false} /> : null}
    </>
  );
}
