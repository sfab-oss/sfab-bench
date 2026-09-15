import { partDisplayName } from "@/lib/part-label";

/** Longest-match occurrence / face token. No spaces. */
export const CAD_REF_TOKEN_RE = /#o\d+(?:\.\d+)*(?:\.f\d+)?/;

/**
 * Cad ref with a leading boundary: start of string, or a character that is not
 * letter / digit / `_` / `/` / `#` / `@` / `+` / `.` / `-`.
 */
export const CAD_REF_RE = new RegExp(
  `(?:^|[^A-Za-z0-9_/#@+.-])(${CAD_REF_TOKEN_RE.source})`,
  "g",
);

export const CAD_REF_HREF_PREFIX = "#cad-ref:";

export const CAD_MENTION_LIST_CAP = 50;
export const CAD_MENTION_FACE_CAP = 50;

export type CadRefHit = {
  start: number;
  end: number;
  ref: string;
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
  return new RegExp(`^${CAD_REF_TOKEN_RE.source}$`).test(text);
}

export function partRefFromCadRef(ref: string): string {
  return ref.replace(/\.f\d+$/, "");
}

export function cadMentionQueryCloses(query: string): boolean {
  return query.endsWith("  ") || query.includes("\n");
}

export function cadRefHref(ref: string): string {
  return `${CAD_REF_HREF_PREFIX}${ref.slice(1)}`;
}

export function cadRefFromHref(href: string | undefined | null): string | null {
  if (!href) return null;
  const hashIndex = href.indexOf(CAD_REF_HREF_PREFIX);
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : href;
  if (!hash.startsWith(CAD_REF_HREF_PREFIX)) return null;
  const ref = `#${hash.slice(CAD_REF_HREF_PREFIX.length)}`;
  return isCadRefToken(ref) ? ref : null;
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

function markdownLinkRanges(text: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  const patterns = [
    /\[[^\]\n]*\]\([^)]*\)/g,
    /\[[^\]\n]*\]\[[^\]\n]*\]/g,
    /^\[[^\]\n]+\]:[ \t]+\S+/gm,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      ranges.push({ start, end: start + match[0].length });
    }
  }
  return ranges;
}

function overlaps(hit: CadRefHit, ranges: CodeRange[]): boolean {
  return ranges.some((range) => hit.start < range.end && range.start < hit.end);
}

export function parseCadRefs(text: string): CadRefHit[] {
  const hits: CadRefHit[] = [];
  const re = new RegExp(CAD_REF_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const ref = match[1];
    if (!ref) continue;
    const start = (match.index ?? 0) + match[0].length - ref.length;
    hits.push({ start, end: start + ref.length, ref });
  }
  return hits;
}

/** Wrap prose refs as markdown links so one markdown render can keep lists/emphasis. */
export function linkifyCadRefsInMarkdown(text: string): string {
  const protectedRanges = [...markdownCodeRanges(text), ...markdownLinkRanges(text)];
  const hits = parseCadRefs(text).filter((hit) => !overlaps(hit, protectedRanges));
  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    out += text.slice(cursor, hit.start);
    out += `[${hit.ref}](${cadRefHref(hit.ref)})`;
    cursor = hit.end;
  }
  return out + text.slice(cursor);
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
    faceLimit?: number;
  },
): { items: CadMentionItem[]; truncated: boolean } {
  const fileStem = options?.fileStem;
  const limit = options?.limit ?? CAD_MENTION_LIST_CAP;
  const faceLimit = options?.faceLimit ?? CAD_MENTION_FACE_CAP;
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
    for (const face of faces) {
      const cadRef = `${selected.cadRef}.f${face.ord}`;
      const name = `Face ${face.ord}`;
      if (!catalogHits([name, `f${face.ord}`, cadRef], query)) continue;
      faceItems.push({ id: cadRef, name, cadRef, kind: "face" });
    }
  }

  return {
    items: [...partItems.slice(0, limit), ...faceItems.slice(0, faceLimit)],
    truncated: partItems.length > limit || faceItems.length > faceLimit,
  };
}
