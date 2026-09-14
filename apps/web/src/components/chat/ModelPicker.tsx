import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ProviderMark } from "@/components/chat/ProviderMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { type HarnessModel, useHarnesses } from "@/hooks/useHarnesses";
import { HARNESS_IDS, HARNESS_LABEL, type HarnessId } from "@/lib/harness";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";
import { cn } from "@/lib/utils";

function shortLabel(slug: string, name?: string) {
  if (name && name.trim()) return name.trim();
  const i = slug.lastIndexOf("/");
  return i >= 0 ? slug.slice(i + 1) : slug;
}

function ModelListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-1">
      <Skeleton className="mb-1 h-3 w-16" />
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

export function ModelPicker() {
  const chatHarness = useStore((s) => s.chatHarness);
  const chatModel = useStore((s) => s.chatModel);
  const { setPrefs } = useProjectSession();
  const { harnesses, ready, error } = useHarnesses();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rail, setRail] = useState<HarnessId>(chatHarness);

  useEffect(() => {
    if (open) setRail(chatHarness);
  }, [open, chatHarness]);

  const active = harnesses.find((h) => h.id === rail);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const models = (active?.models ?? []).filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q) ||
        (m.group ?? "").toLowerCase().includes(q)
      );
    });
    const byGroup = new Map<string, HarnessModel[]>();
    for (const m of models) {
      const key = m.group ?? active?.label ?? "";
      const list = byGroup.get(key) ?? [];
      list.push(m);
      byGroup.set(key, list);
    }
    return [...byGroup.entries()];
  }, [active, q]);

  const selectedName = useMemo(() => {
    for (const h of harnesses) {
      if (h.id !== chatHarness) continue;
      const hit = h.models.find((m) => m.slug === chatModel);
      if (hit) return hit.name;
    }
    return shortLabel(chatModel);
  }, [harnesses, chatHarness, chatModel]);

  const fullTitle = `${HARNESS_LABEL[chatHarness]} · ${selectedName}`;
  const catalogPending = !ready;
  const notReady = active != null && active.status !== "ready";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-32 min-w-0 gap-1.5 px-1.5 text-xs font-normal text-zinc-600"
            title={fullTitle}
          />
        }
      >
        <ProviderMark id={chatHarness} />
        <span className="min-w-0 truncate">{selectedName}</span>
        <ChevronDown className="size-3 shrink-0 text-zinc-400" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="flex h-72 w-80 gap-1 p-1">
        <div className="flex w-10 shrink-0 flex-col gap-0.5 border-r border-zinc-100 pr-1">
          {HARNESS_IDS.map((id) => {
            const info = harnesses.find((h) => h.id === id);
            const dim = info != null && info.status !== "ready";
            return (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="icon-sm"
                title={HARNESS_LABEL[id]}
                aria-label={HARNESS_LABEL[id]}
                className={cn("size-9", rail === id && "bg-zinc-100", dim && "opacity-50")}
                onClick={() => {
                  setRail(id);
                  setQuery("");
                }}
              >
                <ProviderMark id={id} className="size-5" />
              </Button>
            );
          })}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Input
            className="mb-1 h-7 text-xs"
            placeholder="Search models…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {catalogPending ? (
              <ModelListSkeleton />
            ) : error ? (
              <div className="px-2 py-1.5 text-xs text-zinc-500">Couldn’t load models</div>
            ) : notReady ? (
              <div className="px-2 py-1.5 text-xs text-zinc-500">{active.detail ?? active.status}</div>
            ) : groups.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-zinc-500">No matches</div>
            ) : (
              <ul>
                {groups.map(([group, models]) => (
                  <li key={group} className="mb-1">
                    {group ? (
                      <div className="px-2 py-1 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
                        {group}
                      </div>
                    ) : null}
                    {models.map((m) => (
                      <PopoverClose
                        key={m.slug}
                        className={cn(
                          "flex w-full truncate rounded-sm px-2 py-1.5 text-left text-xs",
                          rail === chatHarness && m.slug === chatModel
                            ? "bg-zinc-100 font-medium text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-50",
                        )}
                        onClick={() => setPrefs({ harness: rail, model: m.slug })}
                      >
                        {m.name}
                      </PopoverClose>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
