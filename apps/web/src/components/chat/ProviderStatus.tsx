import { useHarnesses } from "@/hooks/useHarnesses";
import { HARNESS_LABEL } from "@/lib/harness";
import { useStore } from "@/state/store";

export function ProviderStatus() {
  const harness = useStore((s) => s.chatHarness);
  const { harnesses, ready } = useHarnesses();
  const info = harnesses.find((h) => h.id === harness);
  if (!ready || !info || info.status === "ready") return null;
  return (
    <p className="px-2 pb-1 text-xs text-amber-800">
      {HARNESS_LABEL[harness]} is not ready. {info.detail ?? info.status}
    </p>
  );
}
