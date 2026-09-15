import { Extension, mergeAttributes } from "@tiptap/core";
import { Mention as MentionExtension } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { ChatStatus } from "ai";
import {
  ArrowUpIcon,
  AtSignIcon,
  Loader2Icon,
  SquareIcon,
} from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { composerDocFromPrompt, EMPTY_PROMPT_REASON } from "@/chat/composer-recovery";
import { InputGroup, InputGroupButton } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export interface BaseMentionItem {
  id: string;
  name: string;
}

export interface MentionConfig<T extends BaseMentionItem> {
  /** Fixed at mount — changing it later has no effect. */
  trigger: string;
  items: T[] | ((query: string) => T[] | Promise<T[]>);
  render?: (item: T, selected: boolean) => ReactNode;
  chipClassName?: string;
  /** Fixed at mount — changing it later has no effect. */
  allowSpaces?: boolean;
  queryCloses?: (query: string) => boolean;
  emptyMessage?: string;
  getFooter?: (items: T[]) => string | undefined;
}

export type MentionConfigs = Record<string, MentionConfig<BaseMentionItem>>;

type SelectedMentionItems = Record<string, Map<string, BaseMentionItem>>;

// Mapped + intersection shape — cannot be an interface.
export type ComposerParsed<Items extends Record<string, BaseMentionItem>> = {
  text: string;
} & { [K in keyof Items]?: Items[K][] };

export interface ComposerHandle {
  clear: () => void;
  focus: () => void;
  getText: () => string;
  setText: (text: string) => void;
  insertText: (text: string) => void;
  submit: () => void;
  isReady: () => boolean;
}

interface ComposerHelpers {
  clear: () => void;
  focus: () => void;
}

interface ComposerContextValue {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  submit: () => void;
  status?: ChatStatus;
  onStop?: () => void;
  disabled: boolean;
  defaultValue?: string;
  mentions: MentionConfigs | undefined;
  mentionsRef: RefObject<MentionConfigs | undefined>;
  selectedItemsRef: RefObject<SelectedMentionItems>;
  suggestionOpenRef: RefObject<boolean>;
  onPromptHistoryRef: RefObject<((direction: "backward" | "forward") => boolean) | undefined>;
  mentionLabelsForRef: RefObject<((text: string) => Record<string, string>) | undefined>;
  onDraftChangeRef: RefObject<((text: string) => void) | undefined>;
  sendDisabledReason?: string | null;
  canStop?: boolean;
}

function filterStaticItems<T extends BaseMentionItem>(
  items: T[],
  query: string
): T[] {
  const q = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().startsWith(q));
}

function resolveMentionItems<T extends BaseMentionItem>(
  config: MentionConfig<T>,
  query: string
): T[] | Promise<T[]> {
  if (typeof config.items === "function") {
    return config.items(query);
  }
  return filterStaticItems(config.items, query);
}

function mentionTypeFromConfigs(mentions: MentionConfigs | undefined): string | undefined {
  const key = mentions ? Object.keys(mentions)[0] : undefined;
  return key ? `${key}-mention` : undefined;
}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface MentionListProps<T extends BaseMentionItem> {
  items: T[];
  loading?: boolean;
  command: (item: { id: string; label: string }) => void;
  renderItem?: (item: T, selected: boolean) => ReactNode;
  onSelectItem?: (item: T) => void;
  emptyMessage?: string;
  footer?: string;
  ref?: React.Ref<MentionListHandle>;
}

function MentionList<T extends BaseMentionItem>({
  items,
  loading,
  command,
  renderItem,
  onSelectItem,
  emptyMessage,
  footer,
  ref,
}: MentionListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (prevItems !== items) {
    setPrevItems(items);
    setSelectedIndex(0);
  }

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) {
      return;
    }
    onSelectItem?.(item);
    command({ id: item.id, label: item.name });
  };

  const moveSelection = (delta: number) => {
    setSelectedIndex((prev) => {
      const length = Math.max(items.length, 1);
      const next = (prev + delta + length) % length;
      itemRefs.current[next]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        moveSelection(-1);
        return true;
      }
      if (event.key === "ArrowDown") {
        moveSelection(1);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (loading && items.length === 0) {
    return (
      <div className="min-w-48 rounded-md bg-popover px-2 py-1.5 text-muted-foreground text-sm shadow-md ring-1 ring-foreground/10">
        Loading…
      </div>
    );
  }

    return (
      <div
        className="flex max-h-48 min-w-56 max-w-72 flex-col overflow-y-auto overflow-x-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        data-mention-list
      >
      {items.length ? (
        items.map((item, index) => (
          <button
            className={cn(
              "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
              selectedIndex === index && "bg-accent text-accent-foreground"
            )}
            key={item.id}
            onClick={() => selectItem(index)}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
          >
            {renderItem ? (
              renderItem(item, selectedIndex === index)
            ) : (
              <span className="truncate">{item.name}</span>
            )}
          </button>
        ))
      ) : (
        <div className="px-2 py-1.5 text-muted-foreground text-sm">
          {emptyMessage ?? "No results found"}
        </div>
      )}
      {footer ? (
        <div className="px-2 py-1.5 text-muted-foreground text-xs">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function createMentionSuggestion(
  key: string,
  mentionsRef: RefObject<MentionConfigs | undefined>,
  selectedItemsRef: RefObject<SelectedMentionItems>,
  suggestionOpenRef: RefObject<boolean>
) {
  return {
    items: ({ query }: { query: string }) => {
      const config = mentionsRef.current?.[key];
      if (!config) {
        return [];
      }
      return resolveMentionItems(config, query);
    },
    render: () => {
      let component: ReactRenderer<MentionListHandle> | null = null;
      let unmount: (() => void) | undefined;

      const rememberItem = (item: BaseMentionItem) => {
        if (!selectedItemsRef.current[key]) {
          selectedItemsRef.current[key] = new Map();
        }
        selectedItemsRef.current[key].set(item.id, item);
      };

      const listProps = (props: SuggestionProps<BaseMentionItem>) => {
        const config = mentionsRef.current?.[key];
        return {
          items: props.items,
          loading: props.loading,
          command: props.command,
          renderItem: config?.render,
          onSelectItem: rememberItem,
          emptyMessage: config?.emptyMessage,
          footer: config?.getFooter?.(props.items),
        };
      };

      return {
        onStart: (props: SuggestionProps<BaseMentionItem>) => {
          suggestionOpenRef.current = true;
          component = new ReactRenderer(MentionList, {
            props: listProps(props),
            editor: props.editor,
          });
          // The mount wrapper is the positioned element (appended to body,
          // position:absolute). Stack above the compact chat overlay (z-50).
          component.element.style.zIndex = "70";
          component.element.dataset.mentionList = "";
          unmount = props.mount(component.element);
        },
        onUpdate: (props: SuggestionProps<BaseMentionItem>) => {
          component?.updateProps(listProps(props));
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            props.event.preventDefault();
            props.event.stopPropagation();
            unmount?.();
            unmount = undefined;
            suggestionOpenRef.current = false;
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          suggestionOpenRef.current = false;
          unmount?.();
          unmount = undefined;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

function buildMentionExtensions(
  mentionsRef: RefObject<MentionConfigs | undefined>,
  selectedItemsRef: RefObject<SelectedMentionItems>,
  suggestionOpenRef: RefObject<boolean>,
  initialMentions: MentionConfigs | undefined
) {
  return Object.entries(initialMentions ?? {}).map(([key, config]) => {
    const trigger = config.trigger || "@";
    const mentionName = `${key}-mention`;
    const MentionPlugin = MentionExtension.extend({
      name: mentionName,
      // Pin the package default: backspace deletes the whole chip.
      atom: true,
      renderHTML({ node, HTMLAttributes }) {
        const chipClassName = mentionsRef.current?.[key]?.chipClassName;
        const id = String(node.attrs.id ?? "");
        const label = String(node.attrs.label ?? node.attrs.id ?? "");
        return [
          "span",
          mergeAttributes(HTMLAttributes, {
            class: cn(
              "rounded-sm bg-primary px-1 py-0.5 text-primary-foreground no-underline",
              chipClassName
            ),
            title: id,
          }),
          label,
        ];
      },
      renderText({ node }) {
        return String(node.attrs.id ?? "");
      },
    });

    return MentionPlugin.configure({
      deleteTriggerWithBackspace: true,
      suggestion: {
        char: trigger,
        allowSpaces: config.allowSpaces ?? false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const type = state.schema.nodes[mentionName];
          if (!type || !$from.parent.type.contentMatch.matchType(type)) {
            return false;
          }
          const queryCloses = mentionsRef.current?.[key]?.queryCloses;
          if (queryCloses) {
            const query = state.doc
              .textBetween(range.from, range.to)
              .slice(trigger.length);
            if (queryCloses(query)) return false;
          }
          return true;
        },
        ...createMentionSuggestion(
          key,
          mentionsRef,
          selectedItemsRef,
          suggestionOpenRef
        ),
      },
    });
  });
}

function appendMentionFromNode(
  node: JSONContent,
  _mentions: MentionConfigs | undefined,
  selectedItems: SelectedMentionItems,
  buckets: Record<string, BaseMentionItem[]>
): string {
  const key = (node.type ?? "").slice(0, -"-mention".length);
  const attrs = node.attrs ?? {};
  const id = String(attrs.id ?? "");
  const label = String(attrs.label ?? "");

  const cached = selectedItems[key]?.get(id);
  const item: BaseMentionItem = cached ?? { id, name: label };
  if (!buckets[key]) {
    buckets[key] = [];
  }
  if (!buckets[key].some((existing) => existing.id === id)) {
    buckets[key].push(item);
  }
  return id;
}

export function parseEditorContent(
  json: JSONContent,
  mentions: MentionConfigs | undefined,
  selectedItems: SelectedMentionItems
) {
  let text = "";
  const buckets: Record<string, BaseMentionItem[]> = {};

  function recurse(node: JSONContent) {
    if (node.type === "text" && node.text) {
      text += node.text;
      return;
    }
    if (node.type === "hardBreak") {
      text += "\n";
      return;
    }
    if (node.type?.endsWith("-mention")) {
      text += appendMentionFromNode(node, mentions, selectedItems, buckets);
      return;
    }
    if (node.content) {
      for (const child of node.content) {
        recurse(child);
      }
      if (node.type === "paragraph") {
        text += "\n\n";
      }
    }
  }

  if (json.content) {
    for (const node of json.content) {
      recurse(node);
    }
  }

  return { text: text.trim(), ...buckets };
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

function useComposerContext() {
  const ctx = useContext(ComposerContext);
  if (!ctx) {
    throw new Error("Composer components must be used within <Composer>");
  }
  return ctx;
}

type SharedComposerProps = {
  status?: ChatStatus;
  onStop?: () => void;
  disabled?: boolean;
  defaultValue?: string;
  className?: string;
  children: ReactNode;
  sendDisabledReason?: string | null;
  /** Show Stop while a turn is live even if useChat status is not streaming (get_viewer). */
  canStop?: boolean;
  onPromptHistory?: (direction: "backward" | "forward") => boolean;
  mentionLabelsFor?: (text: string) => Record<string, string>;
  onDraftChange?: (text: string) => void;
  /** Imperative handle (clear/focus/getText/setText/insertText/submit), not the DOM node. */
  ref?: Ref<ComposerHandle>;
} & Omit<
  ComponentProps<"div">,
  "children" | "onSubmit" | "defaultValue" | "ref"
>;

type ComposerPropsWithMentions<Items extends Record<string, BaseMentionItem>> =
  SharedComposerProps & {
    mentions: { [K in keyof Items]: MentionConfig<Items[K]> };
    onSubmit: (parsed: ComposerParsed<Items>, helpers: ComposerHelpers) => void;
  };

type ComposerPropsWithoutMentions = SharedComposerProps & {
  mentions?: undefined;
  onSubmit: (parsed: { text: string }, helpers: ComposerHelpers) => void;
};

export function Composer<Items extends Record<string, BaseMentionItem>>(
  props: ComposerPropsWithMentions<Items>
): React.JSX.Element;
export function Composer(
  props: ComposerPropsWithoutMentions
): React.JSX.Element;
export function Composer({
  mentions,
  onSubmit,
  status,
  onStop,
  disabled = false,
  defaultValue,
  className,
  children,
  ref,
  sendDisabledReason,
  canStop,
  onPromptHistory,
  mentionLabelsFor,
  onDraftChange,
  ...props
}: SharedComposerProps & {
  mentions?: MentionConfigs;
  // Runtime parse is untyped; overloads restore Items at the call site.
  // biome-ignore lint/suspicious/noExplicitAny: overload boundary
  onSubmit: (parsed: any, helpers: ComposerHelpers) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const mentionsRef = useRef(mentions);
  const onSubmitRef = useRef(onSubmit);
  const selectedItemsRef = useRef<SelectedMentionItems>({});
  const suggestionOpenRef = useRef(false);
  const onPromptHistoryRef = useRef(onPromptHistory);
  const mentionLabelsForRef = useRef(mentionLabelsFor);
  const onDraftChangeRef = useRef(onDraftChange);

  mentionsRef.current = mentions;
  onSubmitRef.current = onSubmit;
  onPromptHistoryRef.current = onPromptHistory;
  mentionLabelsForRef.current = mentionLabelsFor;
  onDraftChangeRef.current = onDraftChange;

  const parse = useCallback(() => {
    if (!editor) {
      return { text: "" };
    }
    return parseEditorContent(
      editor.getJSON(),
      mentionsRef.current,
      selectedItemsRef.current
    );
  }, [editor]);

  const clear = useCallback(() => {
    editor?.commands.clearContent(true);
    selectedItemsRef.current = {};
  }, [editor]);

  const focus = useCallback(() => {
    editor?.commands.focus("end");
  }, [editor]);

  const submit = useCallback(() => {
    if (disabled) {
      return;
    }
    if (status === "submitted" || status === "streaming") {
      return;
    }
    const parsed = parse();
    onSubmitRef.current(parsed, { clear, focus });
  }, [clear, disabled, focus, parse, status]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      focus,
      getText: () => parse().text,
      setText: (text) => {
        editor?.commands.setContent(
          composerDocFromPrompt(
            text,
            mentionTypeFromConfigs(mentionsRef.current),
            mentionLabelsForRef.current?.(text),
          ),
        );
        editor?.commands.focus("end");
      },
      insertText: (text) => {
        editor?.chain().focus().insertContent(text).run();
      },
      submit,
      isReady: () => Boolean(editor && !editor.isDestroyed),
    }),
    [clear, editor, focus, parse, submit]
  );

  const contextValue = useMemo<ComposerContextValue>(
    () => ({
      editor,
      setEditor,
      submit,
      status,
      onStop,
      disabled,
      defaultValue,
      mentions,
      mentionsRef,
      selectedItemsRef,
      suggestionOpenRef,
      onPromptHistoryRef,
      mentionLabelsForRef,
      onDraftChangeRef,
      sendDisabledReason,
      canStop,
    }),
    [canStop, defaultValue, disabled, editor, mentions, onStop, sendDisabledReason, status, submit]
  );

  useEffect(() => {
    if (!editor) return;
    const sync = () => onDraftChangeRef.current?.(parse().text);
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor, parse]);

  return (
    <ComposerContext.Provider value={contextValue}>
      <InputGroup
        className={cn("h-auto", className)}
        data-slot="composer"
        {...props}
      >
        {children}
      </InputGroup>
    </ComposerContext.Provider>
  );
}

const SubmitEnter = Extension.create({
  name: "composerSubmitEnter",
  addOptions() {
    return {
      getOnEnter: (): (() => void) => () => undefined,
      isSuggestionOpen: (): boolean => false,
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.options.isSuggestionOpen?.()) {
          return false;
        }
        this.options.getOnEnter()?.();
        return true;
      },
    };
  },
});

const PromptHistory = Extension.create({
  name: "composerPromptHistory",
  addOptions() {
    return {
      isSuggestionOpen: (): boolean => false,
      onStep: (_direction: "backward" | "forward"): boolean => false,
    };
  },
  addKeyboardShortcuts() {
    return {
      ArrowUp: () => {
        if (this.options.isSuggestionOpen?.()) {
          return false;
        }
        return this.options.onStep?.("backward") ?? false;
      },
      ArrowDown: () => {
        if (this.options.isSuggestionOpen?.()) {
          return false;
        }
        return this.options.onStep?.("forward") ?? false;
      },
    };
  },
});

export function ComposerEditor({
  placeholder = "Type a message...",
  className,
  autoFocus,
}: {
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const {
    setEditor,
    submit,
    disabled,
    defaultValue,
    mentions,
    mentionsRef,
    selectedItemsRef,
    suggestionOpenRef,
    onPromptHistoryRef,
    mentionLabelsForRef,
    onDraftChangeRef,
  } = useComposerContext();

  const initialMentionsRef = useRef(mentions);
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  const onEnterRef = useRef(submit);
  onEnterRef.current = submit;

  // biome-ignore lint/correctness/useExhaustiveDependencies: editor built once; live config via refs
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        listItem: false,
        bulletList: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
      SubmitEnter.configure({
        getOnEnter: () => onEnterRef.current,
        isSuggestionOpen: () => suggestionOpenRef.current,
      }),
      PromptHistory.configure({
        isSuggestionOpen: () => suggestionOpenRef.current,
        onStep: (direction: "backward" | "forward") =>
          onPromptHistoryRef.current?.(direction) ?? false,
      }),
      ...buildMentionExtensions(
        mentionsRef,
        selectedItemsRef,
        suggestionOpenRef,
        initialMentionsRef.current
      ),
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: composerDocFromPrompt(
      defaultValue ?? "",
      mentionTypeFromConfigs(initialMentionsRef.current),
      mentionLabelsForRef.current?.(defaultValue ?? ""),
    ),
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "data-slot": "input-group-control",
        class: cn(
          "tiptap max-w-none flex-1 rounded-none border-0 bg-transparent py-2 shadow-none outline-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent"
        ),
      },
    },
  });

  useLayoutEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [editor, setEditor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!autoFocus || !editor) return;
    editor.commands.focus("end");
  }, [autoFocus, editor]);

  return (
    <EditorContent
      className={cn(
        "max-h-48 min-h-16 w-full flex-1 overflow-y-auto px-3 py-0",
        "[&_.tiptap]:outline-none",
        "[&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none",
        "[&_.tiptap_p.is-editor-empty:first-child]:before:float-left",
        "[&_.tiptap_p.is-editor-empty:first-child]:before:h-0",
        "[&_.tiptap_p.is-editor-empty:first-child]:before:text-muted-foreground",
        "[&_.tiptap_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        className
      )}
      editor={editor}
    />
  );
}

export function ComposerSubmitButton({
  className,
  disabled,
  children,
  ...props
}: ComponentProps<typeof InputGroupButton>) {
  const {
    editor,
    submit,
    status,
    onStop,
    disabled: contextDisabled,
    sendDisabledReason,
    canStop,
  } = useComposerContext();
  const [emptyPrompt, setEmptyPrompt] = useState(true);

  useEffect(() => {
    if (!editor) return;
    const sync = () => setEmptyPrompt(!editor.getText().trim());
    sync();
    editor.on("update", sync);
    editor.on("create", sync);
    return () => {
      editor.off("update", sync);
      editor.off("create", sync);
    };
  }, [editor]);

  const isInFlight = status === "submitted" || status === "streaming";
  const actAsStop = (isInFlight || Boolean(canStop)) && onStop !== undefined;
  const reason = actAsStop
    ? null
    : (sendDisabledReason ?? (emptyPrompt ? EMPTY_PROMPT_REASON : null));
  const blocked = Boolean(reason) || (disabled ?? contextDisabled) || isInFlight;
  const label = actAsStop ? "Stop" : (reason ?? "Send");

  let icon = <ArrowUpIcon className="size-4" />;
  if (actAsStop) {
    icon = <SquareIcon className="size-4" />;
  } else if (isInFlight) {
    icon = <Loader2Icon className="size-4 animate-spin" />;
  }

  const button = (
    <InputGroupButton
      aria-label={label}
      className={className}
      disabled={actAsStop ? false : blocked}
      onClick={(event) => {
        event.preventDefault();
        if (actAsStop) {
          onStop();
        } else {
          submit();
        }
      }}
      size="icon-sm"
      title={label}
      type="button"
      variant="default"
      {...props}
    >
      {children ?? icon}
      <span className="sr-only">{label}</span>
    </InputGroupButton>
  );

  if (!actAsStop && reason) {
    return (
      <span className="inline-flex" title={reason}>
        {button}
      </span>
    );
  }
  return button;
}

export function ComposerMentionButton({
  trigger,
  className,
  children,
  ...props
}: ComponentProps<typeof InputGroupButton> & { trigger?: string }) {
  const { editor, mentions } = useComposerContext();

  const configs = mentions ? Object.values(mentions) : [];
  const resolvedTrigger = trigger ?? configs[0]?.trigger;
  if (!resolvedTrigger) {
    return null;
  }

  return (
    <InputGroupButton
      aria-label={`Insert ${resolvedTrigger}`}
      className={cn("shrink-0", className)}
      onClick={() => {
        editor?.chain().focus().insertContent(resolvedTrigger).run();
      }}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <AtSignIcon className="size-4" />}
      <span className="sr-only">Insert {resolvedTrigger}</span>
    </InputGroupButton>
  );
}
