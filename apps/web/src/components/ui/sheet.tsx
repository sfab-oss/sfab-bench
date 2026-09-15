import type { ComponentProps, ReactNode, RefObject } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetPopup({
  className,
  children,
  title = "Assistant",
  finalFocus,
  initialFocus,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  title?: string;
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"];
  initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
}) {
  return (
    <DialogPrimitive.Portal keepMounted>
      <DialogPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/50 opacity-100"
      />
      <DialogPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50 flex justify-end">
        <DialogPrimitive.Popup
          data-slot="sheet-content"
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          style={style}
          className={cn(
            "pointer-events-auto flex h-full max-h-none w-full flex-col rounded-none border-0 border-l border-border bg-background p-0 text-foreground shadow-lg outline-none",
            "transition-[opacity,transform] duration-150",
            "data-[starting-style]:translate-x-4 data-[starting-style]:opacity-0",
            "data-[ending-style]:translate-x-4 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

function ChatSheet({
  open,
  onClose,
  width,
  toggleRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width: number;
  toggleRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetPopup
        className="max-w-[90vw] overflow-hidden"
        finalFocus={toggleRef}
        initialFocus={() => {
          const el = document.querySelector<HTMLElement>("[data-chat-composer] .ProseMirror");
          return el ?? true;
        }}
        style={{ width } as ComponentProps<"div">["style"]}
      >
        {children}
      </SheetPopup>
    </Sheet>
  );
}

export { Sheet, SheetPopup, ChatSheet };
