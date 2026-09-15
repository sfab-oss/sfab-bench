import { useEffect, useState } from "react";

import { useViewerChat } from "@/components/chat/useViewerChat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectSession } from "@/hooks/useProjectSession";
import {
  CLOSE_FOLDER_BODY,
  CLOSE_FOLDER_EVENT,
  closeFolderNeedsConfirm,
  closeFolderTitle,
} from "@/lib/motion";
import { closeTabProject, folderName } from "@/lib/project";
import { useStore } from "@/state/store";

export function CloseFolderDialog() {
  const [open, setOpen] = useState(false);
  const path = useProjectSession().project.path;
  const url = useStore((s) => s.url);
  const { tabStreaming } = useViewerChat();

  useEffect(() => {
    const onClose = () => {
      if (!path) return;
      if (closeFolderNeedsConfirm({ hasModel: Boolean(url), replyInProgress: tabStreaming })) {
        setOpen(true);
        return;
      }
      closeTabProject();
    };
    window.addEventListener(CLOSE_FOLDER_EVENT, onClose);
    return () => window.removeEventListener(CLOSE_FOLDER_EVENT, onClose);
  }, [path, url, tabStreaming]);

  const confirm = () => {
    setOpen(false);
    closeTabProject();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm gap-3" showCloseButton={false}>
        <DialogTitle className="pr-0">{closeFolderTitle(folderName(path))}</DialogTitle>
        <DialogDescription>{CLOSE_FOLDER_BODY}</DialogDescription>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={confirm}>
            Close folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
