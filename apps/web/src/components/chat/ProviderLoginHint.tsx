import { loginCommandFromStatus } from "@/chat/model-picker";
import { CommandBlock } from "@/components/ui/command-block";
import { Button } from "@/components/ui/button";
import type { HarnessInfo } from "@/hooks/useHarnesses";

export function ProviderLoginHint({
  info,
  onCheckAgain,
}: {
  info: HarnessInfo;
  onCheckAgain: () => void;
}) {
  const command = loginCommandFromStatus({ status: info.status, detail: info.detail });
  return (
    <div className="flex flex-col gap-1.5">
      {command ? (
        <CommandBlock command={command} />
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-400">{info.detail ?? info.status}</p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 self-start px-2 text-xs"
        onClick={onCheckAgain}
      >
        Check again
      </Button>
    </div>
  );
}
