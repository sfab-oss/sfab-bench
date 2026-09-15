import { ProviderLoginHint } from "@/components/chat/ProviderLoginHint";
import { useHarnesses } from "@/hooks/useHarnesses";
import { useStore } from "@/state/store";

type HarnessCatalog = ReturnType<typeof useHarnesses>;

export function ProviderStatus({ catalog }: { catalog: HarnessCatalog }) {
  const harness = useStore((s) => s.chatHarness);
  const { harnesses, ready, refresh } = catalog;
  const info = harnesses.find((h) => h.id === harness);
  if (!ready || !info || info.status === "ready") return null;
  return (
    <div className="px-2 pb-1">
      <ProviderLoginHint info={info} onCheckAgain={() => refresh("retry")} />
    </div>
  );
}
