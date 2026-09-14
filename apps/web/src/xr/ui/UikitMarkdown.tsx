import { Container, Text } from "@react-three/uikit";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { PhrasingContent, RootContent } from "mdast";
import { gfm } from "micromark-extension-gfm";
import { useMemo, type ReactNode } from "react";

const BODY = "#18181b";
const MUTED = "#52525b";
const CODE_BG = "#e4e4e7";
const LINK = "#2563eb";

/** uikit's default Inter MSDF atlas is Latin + basic punctuation. Missing glyphs render as black squares. */
export function asciiSafe(s: string) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[•‣∙·]/g, "-")
    .replace(/[✓✔✕]/g, "x")
    .replace(/[○◯●]/g, "o")
    .replace(/[▸►▶▹]/g, ">")
    .replace(/[▾▼▽]/g, "v")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/\u00b1/g, "+/-")
    .replace(/\u00b0/g, " deg")
    .replace(/\u00b5|\u03bc/g, "u")
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/")
    .replace(/\u2248/g, "~")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=");
}

type Weight = "medium" | "semi-bold";

function phrasing(nodes: PhrasingContent[], keyPrefix: string, base: { color?: string; weight?: Weight; size?: number } = {}): ReactNode[] {
  const color = base.color ?? BODY;
  const weight = base.weight ?? "medium";
  const size = base.size ?? 13;
  const out: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const k = `${keyPrefix}-${i}`;
    if (node.type === "text") {
      out.push(
        <Text key={k} fontSize={size} fontWeight={weight} color={color}>
          {asciiSafe(node.value)}
        </Text>,
      );
      return;
    }
    if (node.type === "break") {
      out.push(
        <Container key={k} width="100%" height={4} />
      );
      return;
    }
    if (node.type === "strong") {
      out.push(...phrasing(node.children, k, { color, weight: "semi-bold", size }));
      return;
    }
    if (node.type === "emphasis") {
      out.push(...phrasing(node.children, k, { color: MUTED, weight, size }));
      return;
    }
    if (node.type === "inlineCode") {
      out.push(
        <Container key={k} backgroundColor={CODE_BG} borderRadius={4} paddingX={3} paddingY={1}>
          <Text fontSize={size - 1} fontWeight="medium" color={BODY}>
            {asciiSafe(node.value)}
          </Text>
        </Container>,
      );
      return;
    }
    if (node.type === "link") {
      out.push(...phrasing(node.children, k, { color: LINK, weight, size }));
      return;
    }
    if (node.type === "delete") {
      out.push(...phrasing(node.children, k, { color: MUTED, weight, size }));
      return;
    }
    const leftover = asciiSafe(plainNode(node));
    if (leftover) {
      out.push(
        <Text key={k} fontSize={size} fontWeight={weight} color={color}>
          {leftover}
        </Text>,
      );
    }
  });
  return out;
}

function Inline({
  nodes,
  size = 13,
  weight,
}: {
  nodes: PhrasingContent[];
  size?: number;
  weight?: Weight;
}) {
  return (
    <Container flexDirection="row" flexWrap="wrap" alignItems="center" width="100%" gap={0}>
      {phrasing(nodes, "p", { size, weight })}
    </Container>
  );
}

function Block({ node, index }: { node: RootContent; index: number }) {
  if (node.type === "paragraph") {
    return <Inline nodes={node.children} />;
  }
  if (node.type === "heading") {
    const size = node.depth <= 1 ? 18 : node.depth === 2 ? 16 : 14;
    return <Inline nodes={node.children} size={size} weight="semi-bold" />;
  }
  if (node.type === "table") {
    return (
      <Container width="100%" flexShrink={0} flexDirection="column" gap={0}>
        {node.children.map((row, ri) => (
          <Container key={ri} width="100%" flexShrink={0} flexDirection="column">
            <Container width="100%" flexDirection="row" gap={6} paddingY={4}>
              {row.children.map((cell, ci) => (
                <Container key={ci} flexGrow={1} flexBasis={0} minWidth={0} flexShrink={0}>
                  <Inline
                    nodes={cell.children}
                    size={12}
                    weight={ri === 0 ? "semi-bold" : "medium"}
                  />
                </Container>
              ))}
            </Container>
            {ri === 0 ? <Container width="100%" height={1} backgroundColor="#e4e4e7" /> : null}
          </Container>
        ))}
      </Container>
    );
  }
  if (node.type === "code") {
    const lines = node.value.split("\n");
    return (
      <Container width="100%" backgroundColor={CODE_BG} borderRadius={8} padding={8} flexDirection="column" gap={2}>
        {lines.map((line, i) => (
          <Text key={i} fontSize={12} color={BODY} fontWeight="medium">
            {line.length === 0 ? " " : asciiSafe(line)}
          </Text>
        ))}
      </Container>
    );
  }
  if (node.type === "list") {
    return (
      <Container width="100%" flexDirection="column" gap={4} paddingLeft={4}>
        {node.children.map((item, i) => (
          <Container key={i} flexDirection="row" gap={6} width="100%" flexShrink={0}>
            <Text fontSize={13} color={BODY} fontWeight="medium">
              {item.checked === true ? "[x]" : item.checked === false ? "[ ]" : node.ordered ? `${(node.start ?? 1) + i}.` : "-"}
            </Text>
            <Container flexGrow={1} minWidth={0} flexDirection="column" gap={4}>
              {item.children.map((child, j) => (
                <Block key={j} node={child} index={j} />
              ))}
            </Container>
          </Container>
        ))}
      </Container>
    );
  }
  if (node.type === "blockquote") {
    return (
      <Container
        width="100%"
        flexDirection="column"
        gap={4}
        paddingLeft={8}
        borderLeftWidth={2}
        borderColor="#d4d4d8"
      >
        {node.children.map((child, i) => (
          <Block key={i} node={child} index={i} />
        ))}
      </Container>
    );
  }
  if (node.type === "thematicBreak") {
    return <Container width="100%" height={1} backgroundColor="#d4d4d8" />;
  }
  if (node.type === "html") {
    return (
      <Text fontSize={13} color={BODY}>
        {asciiSafe(node.value)}
      </Text>
    );
  }
  return (
    <Text fontSize={13} color={BODY}>
      {asciiSafe(plainNode(node))}
    </Text>
  );
}

function plainNode(node: RootContent | PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => plainNode(child as PhrasingContent)).join("");
  }
  if ("alt" in node && typeof node.alt === "string") return node.alt;
  if ("url" in node && typeof node.url === "string") return node.url;
  return "";
}

export function UikitMarkdown({ markdown }: { markdown: string }) {
  const tree = useMemo(() => {
    try {
      return fromMarkdown(markdown, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
      });
    } catch {
      return null;
    }
  }, [markdown]);

  if (!markdown.trim()) return null;
  if (!tree) {
    return (
      <Text fontSize={13} color={BODY}>
        {asciiSafe(markdown)}
      </Text>
    );
  }

  return (
    <Container width="100%" flexShrink={0} flexDirection="column" gap={8}>
      {tree.children.map((node, i) => (
        <Block key={`${node.type}-${i}`} node={node} index={i} />
      ))}
    </Container>
  );
}
