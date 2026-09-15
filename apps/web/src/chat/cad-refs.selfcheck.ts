import {
  CAD_MENTION_FACE_CAP,
  CAD_MENTION_LIST_CAP,
  cadMentionQueryCloses,
  filterCadMentionCatalog,
  flattenEditorJson,
  isCadRefToken,
  parseCadRefs,
  partRefFromCadRef,
  resolveCadRef,
  splitCadRefSegments,
} from "./cad-refs";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const look = parseCadRefs("Look at #o1.1 and #o1.1.f6.");
expect(look.length === 2, "two refs");
expect(look[0]?.ref === "#o1.1", "part token");
expect(look[1]?.ref === "#o1.1.f6", "face token");

expect(parseCadRefs("see #heading next").length === 0, "ATX heading is not a ref");
expect(parseCadRefs("bare #o and done").length === 0, "#o without digits");
expect(parseCadRefs("x #o1.1 y")[0]?.ref === "#o1.1", "longer match beats #o1");
expect(isCadRefToken("#o1.2.1.f6"), "whole-string face token");
expect(!isCadRefToken("#o1.1 extra"), "token must be the whole string");
expect(partRefFromCadRef("#o1.1.f6") === "#o1.1", "strip face suffix");

const split = splitCadRefSegments("Look at #o1.1 and #o1.1.f6.");
expect(
  split.map((s) => (s.type === "ref" ? s.ref : s.text)).join("|") ===
    "Look at |#o1.1| and |#o1.1.f6|.",
  `split segments, got ${split.map((s) => (s.type === "ref" ? s.ref : s.text)).join("|")}`,
);

const coded = splitCadRefSegments(
  "I raised #o1.2.1 by 5 mm. `#o1.2.2` is unchanged, and #o9.9.f1 is not in this model.",
  { skipCode: true },
);
const codedBits = coded.map((s) => (s.type === "ref" ? `REF:${s.ref}` : s.text));
expect(codedBits.includes("REF:#o1.2.1"), "prose part is a chip");
expect(codedBits.includes("REF:#o9.9.f1"), "unresolved prose is still split out");
expect(
  coded.some((s) => s.type === "text" && s.text.includes("`#o1.2.2`")),
  "inline code keeps the raw token",
);
expect(
  coded.every((s) => s.type !== "ref" || s.ref !== "#o1.2.2"),
  "inline-code ref is not a chip",
);

const fenced = splitCadRefSegments("before\n```\n#o1.1\n```\nafter #o1.2", { skipCode: true });
expect(
  fenced.some((s) => s.type === "ref" && s.ref === "#o1.2"),
  "ref after fence still splits",
);
expect(
  fenced.every((s) => s.type !== "ref" || s.ref !== "#o1.1"),
  "fenced ref is not a chip",
);

const flat = flattenEditorJson({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Make " },
        { type: "part-mention", attrs: { id: "#o1.1", label: "Bracket" } },
        { type: "text", text: " taller" },
      ],
    },
  ],
});
expect(flat.includes("#o1.1"), "flatten keeps the ref");
expect(!flat.includes("Bracket"), "flatten drops the label");
expect(!flat.includes("#Bracket"), "flatten is not trigger+label");

const parts = [
  { name: "Bracket", cadRef: "#o1.1" },
  { name: "post_left", cadRef: "#o1.2.1" },
];
expect(resolveCadRef("#o1.1.f6", parts)?.kind === "face", "face resolves through the part");
expect(resolveCadRef("#o1.1.f6", parts)?.label === "Face 6", "face chip label");
expect(resolveCadRef("#o1.2.1", parts)?.label === "post_left", "part chip uses display name");
expect(resolveCadRef("#o9.9", parts) === null, "missing part is unresolved");
expect(resolveCadRef("#o9.9.f1", parts) === null, "missing face-part is unresolved");

const bolts = [
  { name: "Bolt", cadRef: "#o1.1" },
  { name: "Bolt", cadRef: "#o1.2" },
  { name: "plate_1", cadRef: "#o1.3" },
];
const bothBolts = filterCadMentionCatalog(bolts, "bolt");
expect(bothBolts.items.length === 2, "includes matches both duplicate names");
expect(
  bothBolts.items.every((item) => item.name === "Bolt"),
  "chip label is the display name",
);
const byRef = filterCadMentionCatalog(bolts, "#o1.2");
expect(byRef.items.length === 1 && byRef.items[0]?.id === "#o1.2", "filter by ref");
const spaced = filterCadMentionCatalog([{ name: "Left bracket", cadRef: "#o2.1" }], "left br");
expect(spaced.items.length === 1, "spaces in the query still includes");

const noFaces = filterCadMentionCatalog(bolts, "", {
  selectedPart: bolts[0],
  faces: undefined,
});
expect(
  noFaces.items.every((item) => item.kind === "part"),
  "no faces unless the selected leaf supplies ranges",
);

const withFaces = filterCadMentionCatalog(bolts, "", {
  selectedPart: bolts[0],
  faces: [{ ord: 1 }, { ord: 6 }],
});
expect(withFaces.items.at(-1)?.id === "#o1.1.f6", "faces follow parts");
expect(withFaces.items.some((item) => item.name === "Face 6"), "face label from ordinal");

const faceQuery = filterCadMentionCatalog(bolts, "f6", {
  selectedPart: bolts[0],
  faces: [{ ord: 1 }, { ord: 6 }],
});
expect(faceQuery.items.some((item) => item.id === "#o1.1.f6"), "face query matches fN");

const many = Array.from({ length: CAD_MENTION_LIST_CAP + 5 }, (_, i) => ({
  name: `stud_${i + 1}`,
  cadRef: `#o1.${i + 1}`,
}));
const capped = filterCadMentionCatalog(many, "");
expect(capped.items.length === CAD_MENTION_LIST_CAP, "list cap");
expect(capped.truncated, "truncated footer signal");

expect(CAD_MENTION_FACE_CAP === 50, "face cap is the manager default");
expect(cadMentionQueryCloses("post  "), "two trailing spaces close");
expect(cadMentionQueryCloses("post\n"), "newline closes");
expect(!cadMentionQueryCloses("post "), "one trailing space stays open");
expect(!cadMentionQueryCloses("left br"), "internal space stays open");

console.log("cad-refs.selfcheck ok");
