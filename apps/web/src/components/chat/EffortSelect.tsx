import {
  CHAT_EFFORTS,
  CHAT_EFFORT_LABEL,
  harnessSupportsEffort,
  isChatEffort,
} from "@/lib/harness";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/state/store";

export function EffortSelect() {
  const harness = useStore((s) => s.chatHarness);
  const effort = useStore((s) => s.chatEffort);
  const setChatEffort = useStore((s) => s.setChatEffort);
  if (!harnessSupportsEffort(harness)) return null;
  return (
    <Select
      modal={false}
      value={effort}
      items={CHAT_EFFORTS.map((value) => ({ value, label: CHAT_EFFORT_LABEL[value] }))}
      onValueChange={(value: string | null) => {
        if (value && isChatEffort(value)) setChatEffort(value);
      }}
    >
      <SelectTrigger aria-label="Reasoning effort" className="max-w-20 min-w-0 @[360px]/chat:max-w-none">
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
