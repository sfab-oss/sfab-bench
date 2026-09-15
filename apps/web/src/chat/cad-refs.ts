import { partDisplayName } from "@/lib/part-label";

/** Longest-match occurrence / face token. No spaces. */
export const CAD_REF_RE = /#o\d+(?:\.\d+)*(?:\.f\d+)?/g;

export const CAD_MENTION_LIST_CAP = 50;
export const CAD_MENTION_FACE_CAP = 50;

export type CadRefHit = {
  start: number;
  end: number;
  ref: string;
};

export type CadRefSegment =
  | { type: "text"; text: string }
  | { type: "ref"; ref: string };

export type EditorJsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: EditorJsonNode[];
};

export type CadMentionCatalogPart = {
  name: string;
  cadRef: string;
};

export type CadMentionItem = {
  id: string;
  name: string;
  cadRef: string;
  kind: "part" | "face";
};

export type ResolvedCadRef = {
  ref: string;
  partRef: string;
  label: string;
  kind: "part" | "face";
  faceOrd?: number;
};

type CodeRange = { start: number; end: number };

export function isCadRefToken(text: string): boolean {
  const re = new RegExp(`^${CAD_REF_RE.source}$`);
  return re.test(text);
}

export function partRefFromCadRef(ref: string): string {
  return ref.replace(/\.f\d+$/, "");
}

export function cadMentionQueryCloses(query: string): boolean {
  return query.endsWith("  ") || query.includes("\n");
}

function markdownFenceRanges(text: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  const open = /^(```|~~~)/gm;
  let match: RegExpExecArray | null = open.exec(text);
  while (match) {
    const marker = match[1]!;
    const lineEnd = text.indexOf("\n", match.index);
    if (lineEnd < 0) {
      ranges.push({ start: match.index, end: text.length });
      break;
    }
    const rest = text.slice(lineEnd + 1);
    const close = new RegExp(`^${marker}[^\\S\\n]*$`, "m").exec(rest);
    if (!close || close.index < 0) {
      ranges.push({ start: match.index, end: text.length });
      break;
    }
    const end = lineEnd + 1 + close.index + close[0].length;
    ranges.push({ start: match.index, end });
    open.lastIndex = end;
    match = open.exec(text);
  }
  return ranges;
}

function inRanges(index: number, ranges: CodeRange[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function markdownInlineCodeRanges(text: string, fences: CodeRange[]): CodeRange[] {
  const ranges: CodeRange[] = [];
  let i = 0;
  while (i < text.length) {
    if (inRanges(i, fences)) {
      i += 1;
      continue;
    }
    if (text[i] !== "`") {
      i += 1;
      continue;
    }
    let ticks = 0;
    while (text[i + ticks] === "`") ticks += 1;
    const closer = "`".repeat(ticks);
    const close = text.indexOf(closer, i + ticks);
    if (close < 0 || inRanges(close, fences)) {
      i += ticks;
      continue;
    }
    ranges.push({ start: i, end: close + ticks });
    i = close + ticks;
  }
  return ranges;
}

function markdownCodeRanges(text: string): CodeRange[] {
  const fences = markdownFenceRanges(text);
  return [...fences, ...markdownInlineCodeRanges(text, fences)];
}

function overlaps(hit: CadRefHit, ranges: CodeRange[]): boolean {
  return ranges.some((range) => hit.start < range.end && range.start < hit.end);
}

export function parseCadRefs(text: string): CadRefHit[] {
  const hits: CadRefHit[] = [];
  const re = new RegExp(CAD_REF_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    hits.push({ start, end: start + match[0].length, ref: match[0] });
  }
  return hits;
}

export function splitCadRefSegments(
  text: string,
  options?: { skipCode?: boolean },
): CadRefSegment[] {
  const skipCode = options?.skipCode ?? false;
  const protectedRanges = skipCode ? markdownCodeRanges(text) : [];
  const hits = parseCadRefs(text).filter((hit) => !overlaps(hit, protectedRanges));
  const segments: CadRefSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, hit.start) });
    }
    segments.push({ type: "ref", ref: hit.ref });
    cursor = hit.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }
  return segments;
}

export function flattenEditorJson(json: EditorJsonNode): string {
  let text = "";

  function recurse(node: EditorJsonNode) {
    if (node.type === "text" && node.text) {
      text += node.text;
      return;
    }
    if (node.type === "hardBreak") {
      text += "\n";
      return;
    }
    if (node.type?.endsWith("-mention")) {
      text += String(node.attrs?.id ?? "");
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

  return text.trim();
}

export function resolveCadRef(
  ref: string,
  parts: readonly { name: string; cadRef?: string | null }[],
  fileStem?: string,
): ResolvedCadRef | null {
  if (!isCadRefToken(ref)) return null;
  const partRef = partRefFromCadRef(ref);
  const part = parts.find((item) => item.cadRef === partRef);
  if (!part) return null;
  const face = /\.f(\d+)$/.exec(ref);
  if (face) {
    return {
      ref,
      partRef,
      label: `Face ${face[1]}`,
      kind: "face",
      faceOrd: Number(face[1]),
    };
  }
  return {
    ref,
    partRef,
    label: partDisplayName(part, part.cadRef ?? partRef, fileStem),
    kind: "part",
  };
}

function catalogHits(values: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function filterCadMentionCatalog(
  parts: readonly CadMentionCatalogPart[],
  query: string,
  options?: {
    fileStem?: string;
    selectedPart?: CadMentionCatalogPart;
    faces?: readonly { ord: number }[];
    limit?: number;
  },
): { items: CadMentionItem[]; truncated: boolean } {
  const fileStem = options?.fileStem;
  const limit = options?.limit ?? CAD_MENTION_LIST_CAP;
  const partItems: CadMentionItem[] = [];
  for (const part of parts) {
    if (!part.cadRef) continue;
    const display = partDisplayName(part, part.cadRef, fileStem);
    if (!catalogHits([display, part.name, part.cadRef], query)) continue;
    partItems.push({
      id: part.cadRef,
      name: display,
      cadRef: part.cadRef,
      kind: "part",
    });
  }

  const faceItems: CadMentionItem[] = [];
  const selected = options?.selectedPart;
  const faces = options?.faces;
  if (selected?.cadRef && faces?.length) {
    const selectedDisplay = partDisplayName(selected, selected.cadRef, fileStem);
    for (const face of faces) {
      const cadRef = `${selected.cadRef}.f${face.ord}`;
      const name = `Face ${face.ord}`;
      if (
        !catalogHits(
          [name, `f${face.ord}`, cadRef, selectedDisplay, selected.name, selected.cadRef],
          query,
        )
      ) {
        continue;
      }
      faceItems.push({ id: cadRef, name, cadRef, kind: "face" });
    }
  }

  const combined = [...partItems, ...faceItems];
  return {
    items: combined.slice(0, limit),
    truncated: combined.length > limit,
  };
}
