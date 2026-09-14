import { Headset, Settings } from "lucide-react";
import { useState } from "react";

import { AppearancePicker } from "@/components/theme/theme-toggle";
import { QuestJoinPanel } from "@/components/QuestJoinPanel";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

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
            <PopoverContent side="top" align="start" className="w-56 p-2">
              <div className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Appearance</div>
              <AppearancePicker />
              {host ? (
                <>
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
