import {
  CHAT_EFFORTS,
  CHAT_EFFORT_LABEL,
  harnessSupportsEffort,
  isChatEffort,
} from "@/lib/harness";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectSession } from "@/hooks/useProjectSession";
import { useStore } from "@/state/store";

export function EffortSelect() {
  const harness = useStore((s) => s.chatHarness);
  const effort = useStore((s) => s.chatEffort);
  const { setPrefs } = useProjectSession();
  if (!harnessSupportsEffort(harness)) return null;
  return (
    <Select
      modal={false}
      value={effort}
      items={CHAT_EFFORTS.map((value) => ({ value, label: CHAT_EFFORT_LABEL[value] }))}
      onValueChange={(value: string | null) => {
        if (value && isChatEffort(value)) setPrefs({ effort: value });
      }}
    >
      <SelectTrigger aria-label="Reasoning effort">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CHAT_EFFORTS.map((value) => (
          <SelectItem key={value} value={value}>
            {CHAT_EFFORT_LABEL[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
