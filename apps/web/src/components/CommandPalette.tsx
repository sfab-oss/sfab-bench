import { Check, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";

import { StartTruncatedPath } from "@/components/StartTruncatedPath";
import { useTheme } from "@/components/theme/theme-provider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import type { OpenFolderApi } from "@/components/OpenFolder";
import { useCatalog } from "@/hooks/useCatalog";
import { useProjectSession } from "@/hooks/useProjectSession";
import { isMacPlatform } from "@/lib/files-rail";
import {
  buildCommands,
  clampActiveIndex,
  isCommandPaletteToggle,
  otherModalDialogOpen,
  requestNewChat,
  requestOpenQuest,
  requestOpenSettings,
  visiblePalette,
  wrapActiveIndex,
  type ModalProbe,
  type PaletteCommand,
  type PalettePart,
} from "@/lib/command-palette";
import { disambiguateSiblingNames, partDisplayName, partLabelFileStem } from "@/lib/part-label";
import { closeTabProject, folderName, shortPath } from "@/lib/project";
import { isCompactChat } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { store, useStore } from "@/state/store";

const EMPTY_PARTS: PalettePart[] = [];
const EMPTY_COMMANDS: PaletteCommand[] = [];

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function probeOpenModals(): ModalProbe[] {
  return Array.from(document.querySelectorAll("[data-slot='dialog-content']")).map((el) => ({
    palette: Boolean(el.closest("[data-command-palette]")),
    ending: el.hasAttribute("data-ending-style"),
  }));
}

function restoreFocus(el: HTMLElement | null) {
  if (!el?.isConnected) return;
  el.focus();
}

export function CommandPalette({
  host,
  folder,
  compactChat,
}: {
  host: boolean;
  folder: OpenFolderApi;
  compactChat: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const restoreRef = useRef<HTMLElement | null>(null);
  const skipRestoreRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const { setTheme } = useTheme();
  const { project, setDoc } = useProjectSession();
  const { files: catalog } = useCatalog(Boolean(project.path));
  const { url, review, title, treeOpen, chatOpen, compactChatOpen } = useStore(
    useShallow((s) => ({
      url: s.url,
      review: s.review,
      title: s.title,
      treeOpen: s.treeOpen,
      chatOpen: s.chatOpen,
      compactChatOpen: s.compactChatOpen,
    })),
  );
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
  const chatVisible = compactChat ? compactChatOpen : chatOpen;

  const parts = useMemo<PalettePart[]>(() => {
    if (!review) return EMPTY_PARTS;
    const withRef = review.parts.filter((part) => part.cadRef);
    if (withRef.length === 0) return EMPTY_PARTS;
    const fileStem = partLabelFileStem(review.parts.length, title);
    const labeled = withRef.map((part) => ({
      key: part.cadRef ?? `id:${part.id}`,
      display: partDisplayName(part, part.cadRef, fileStem),
      ref: part.cadRef,
    }));
    const labels = disambiguateSiblingNames(labeled);
    return withRef.map((part, index) => ({
      displayName: labels.get(labeled[index]!.key) ?? labeled[index]!.display,
      ref: part.cadRef as string,
    }));
  }, [review, title]);

  const commands = useMemo(() => {
    if (!open) return EMPTY_COMMANDS;
    const currentPath = project.path;
    return buildCommands({
      mac,
      canOpenFolder: folder.canRegister,
      host,
      hasProject: Boolean(currentPath),
      hasModel: Boolean(review),
      filesOpen: treeOpen,
      chatOpen: chatVisible,
      files: catalog.map((file) => ({
        name: fileName(file.path),
        path: file.path,
        current: file.path === url,
      })),
      folders: folder.recents
        .filter((row) => row.path !== currentPath)
        .map((row) => ({
          name: row.name || folderName(row.path),
          path: row.path,
          subtitle: shortPath(row.path),
        })),
      parts,
    });
  }, [
    open,
    mac,
    folder.canRegister,
    folder.recents,
    host,
    project.path,
    review,
    treeOpen,
    chatVisible,
    catalog,
    url,
    parts,
  ]);

  const { groups, items } = useMemo(() => visiblePalette(commands, query), [commands, query]);
  const active = clampActiveIndex(activeIndex, items.length);

  const finishClose = useCallback((restore: boolean) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    const el = restoreRef.current;
    restoreRef.current = null;
    if (restore) restoreFocus(el);
  }, []);

  const execute = useCallback(
    (cmd: PaletteCommand) => {
      const s = store.getState();
      const compact = isCompactChat(window.innerWidth, s.treeOpen);
      if (cmd.id === "action:open-folder") {
        void folder.requestOpen();
        return;
      }
      if (cmd.id === "action:toggle-files") {
        s.setTreeOpen(!s.treeOpen);
        return;
      }
      if (cmd.id === "action:toggle-chat") {
        if (compact) s.setCompactChatOpen(!s.compactChatOpen);
        else s.setChatOpen(!s.chatOpen);
        return;
      }
      if (cmd.id === "action:new-chat") {
        if (compact) s.setCompactChatOpen(true);
        else s.setChatOpen(true);
        requestNewChat();
        return;
      }
      if (cmd.id === "action:settings") {
        requestOpenSettings();
        return;
      }
      if (cmd.id === "action:enter-quest") {
        requestOpenQuest();
        return;
      }
      if (cmd.id === "action:frame-model") {
        if (s.review) s.fit?.(s.review.root);
        return;
      }
      if (cmd.id === "action:frame-selection") {
        const obj = s.selectedId !== null ? s.review?.parts[s.selectedId]?.object : s.review?.root;
        if (obj) s.fit?.(obj);
        return;
      }
      if (cmd.id === "action:close-folder") {
        closeTabProject();
        return;
      }
      if (cmd.group === "files" && cmd.payload) {
        void setDoc(cmd.payload);
        return;
      }
      if (cmd.group === "folders" && cmd.payload) {
        folder.pickRecent(cmd.payload);
        return;
      }
      if (cmd.group === "parts" && cmd.payload) {
        s.selectByRef(cmd.payload);
        return;
      }
      if (cmd.group === "appearance" && cmd.payload) {
        setTheme(cmd.payload);
      }
    },
    [folder, setDoc, setTheme],
  );

  const run = useCallback(
    (cmd: PaletteCommand | undefined) => {
      if (!cmd) return;
      skipRestoreRef.current = true;
      finishClose(false);
      window.setTimeout(() => execute(cmd), 0);
    },
    [execute, finishClose],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!isCommandPaletteToggle(event, mac)) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        finishClose(!skipRestoreRef.current);
        skipRestoreRef.current = false;
        return;
      }
      if (otherModalDialogOpen(probeOpenModals())) return;
      restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      skipRestoreRef.current = false;
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finishClose, mac, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const onListKeyDown = (event: ReactKeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(wrapActiveIndex(active, 1, items.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(wrapActiveIndex(active, -1, items.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run(items[active]);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        const restore = !skipRestoreRef.current;
        skipRestoreRef.current = false;
        finishClose(restore);
      }}
    >
      <DialogContent
        data-command-palette=""
        showCloseButton={false}
        viewportClassName="items-start justify-center pt-[12vh] sm:pt-[15vh]"
        className="max-h-[min(28rem,calc(100dvh-8rem))] max-w-lg gap-0 self-start p-0"
        onKeyDownCapture={onListKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command…"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="min-h-0 flex-1 overflow-y-auto p-1"
        >
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No results</p>
          ) : (
            groups.map((group, groupPos) => {
              const start = groups.slice(0, groupPos).reduce((n, row) => n + row.items.length, 0);
              return (
              <section key={group.id} className="mb-1">
                <h2 className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h2>
                <ul>
                  {group.items.map((cmd, groupIndex) => {
                    const index = start + groupIndex;
                    const selected = index === active;
                    return (
                      <li key={cmd.id}>
                        <button
                          ref={selected ? activeRowRef : undefined}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                            selected ? "bg-accent text-accent-foreground" : "text-foreground",
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => run(cmd)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              {cmd.current ? <Check className="size-3.5 shrink-0" /> : null}
                              <span className="min-w-0 truncate">{cmd.title}</span>
                            </span>
                            {cmd.subtitle ? (
                              <StartTruncatedPath
                                path={cmd.subtitle}
                                className="font-mono text-[11px] text-muted-foreground"
                              />
                            ) : null}
                          </span>
                          {cmd.shortcut ? <Kbd className="shrink-0">{cmd.shortcut}</Kbd> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
            })
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd>
            run
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
