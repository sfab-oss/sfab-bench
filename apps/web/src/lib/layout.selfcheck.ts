import {
  CANVAS_MIN_WIDTH,
  CHAT_DEFAULT_WIDTH,
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
  COMPACT_CHAT_BREAKPOINT,
  DETAIL_COMPACT_THRESHOLD,
  DETAIL_WIDTH,
  FILES_RAIL_WIDTH,
  OVERLAY_BOTH_THRESHOLD,
  PART_TREE_WIDTH,
  TOOLBAR_TOP,
  TOOLBAR_WIDTH,
  chatLayoutWidth,
  chatMaxForWindow,
  clampChatDrag,
  clampStoredChatWidth,
  detailPanelWidth,
  fitDistanceScale,
  fitInsets,
  fitPanNdc,
  isCompactChat,
  overlayLayout,
  overlayMaxHeight,
  preferredChatWidth,
  toolbarLayout,
  toolbarRightReserve,
} from "./layout";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(FILES_RAIL_WIDTH === 304, "19rem rail");
expect(CHAT_MIN_WIDTH === 280, "min chat");
expect(CHAT_MAX_WIDTH === 720, "max chat");
expect(CHAT_DEFAULT_WIDTH === 384, "default chat");
expect(CANVAS_MIN_WIDTH === 480, "canvas floor");
expect(COMPACT_CHAT_BREAKPOINT === 980, "T3 compact breakpoint");
expect(OVERLAY_BOTH_THRESHOLD === 620, "PartTree + Detail + gaps");
expect(PART_TREE_WIDTH === 280, "PartTree width");
expect(DETAIL_WIDTH === 260, "Detail width");
expect(TOOLBAR_WIDTH === 198, "toolbar pill width");

expect(preferredChatWidth(100) === CHAT_MIN_WIDTH, "stored below min");
expect(preferredChatWidth(900) === CHAT_MAX_WIDTH, "stored above max");
expect(preferredChatWidth(384.4) === 384, "rounds");
expect(clampStoredChatWidth(720) === 720, "persist path keeps 720");
expect(clampStoredChatWidth(200) === 280, "persist path still has 280 floor");

expect(isCompactChat(980, false), "980px is compact (max-width: 980px)");
expect(isCompactChat(979, true), "below 980 compact");
expect(isCompactChat(981, false) === false, "981 without rail is docked");
expect(isCompactChat(1024, true), "1024 + rail cannot hold 304+280+480");
expect(isCompactChat(1064, true) === false, "exactly rail+min chat+canvas stays docked");
expect(isCompactChat(1280, true) === false, "1280 + rail is docked");
expect(isCompactChat(900, true), "900 is compact");
expect(isCompactChat(800, false), "800 tab is compact even with rail closed");

expect(chatMaxForWindow(1440, true) === 1440 - 304 - 480, "1440 rail leaves 656 for chat");
expect(chatLayoutWidth(720, 1440, true) === 656, "layout clamps 720 so canvas stays 480");
expect(clampStoredChatWidth(720) === 720, "layout clamp does not rewrite stored 720");
expect(chatLayoutWidth(384, 1440, true) === 384, "default fits at 1440");
expect(chatLayoutWidth(720, 1280, true) === 1280 - 304 - 480, "1280 clamps stored 720");
expect(clampChatDrag(800, 1440, true) === 656, "drag cannot starve the canvas");
expect(clampChatDrag(200, 1440, true) === 280, "drag still has 280 floor");
expect(clampChatDrag(CHAT_DEFAULT_WIDTH, 1440, true) === CHAT_DEFAULT_WIDTH, "double-click default");

expect(chatLayoutWidth(720, 900, true) === 720, "900×90vw is above max so stored 720 wins");
expect(chatLayoutWidth(720, 600, true) === Math.floor(600 * 0.9), "compact sheet is min(stored, 90vw)");
expect(chatLayoutWidth(280, 900, true) === 280, "compact keeps 280");
expect(chatLayoutWidth(500, 500, false) === Math.floor(500 * 0.9), "compact 90vw when stored is wider");

const overlaysWide = overlayLayout(800);
expect(overlaysWide.autoCollapseParts === false, "800 canvas keeps both overlays");
expect(overlaysWide.detailCompact === false, "800 is above detail compact");
const overlaysMid = overlayLayout(619);
expect(overlaysMid.autoCollapseParts, "below 620 chips PartTree");
expect(overlaysMid.detailCompact === false, "619 keeps Detail as a panel");
const overlaysTight = overlayLayout(479);
expect(overlaysTight.autoCollapseParts, "479 chips PartTree");
expect(overlaysTight.detailCompact, "below 480 Detail is compact");
expect(overlayLayout(0).autoCollapseParts === false, "unmeasured canvas does not collapse");

expect(overlayMaxHeight(600) === 600 - 64 - 24, "Electron min height 600");
expect(overlayMaxHeight(600) <= 512, "never above 32rem cap on short canvas");
expect(overlayMaxHeight(900) === 512, "tall canvas caps at 32rem");

expect(detailPanelWidth(800, false, false) === 260, "full Detail");
expect(detailPanelWidth(350, true, true) < 260, "compact Detail shrinks");
expect(detailPanelWidth(350, true, true) <= 350 - 16 - 12 - 12 - 96, "leaves the Model chip");

const insets = fitInsets({ partsExpanded: true, partsChip: false, detailVisible: true, detailWidth: 260 });
expect(insets.left === 12 + 280, "expanded tree inset");
expect(insets.right === 16 + 260, "detail inset");
expect(insets.top === 64, "toolbar row");
const chipInsets = fitInsets({ partsExpanded: false, partsChip: true, detailVisible: true, detailWidth: 200 });
expect(chipInsets.left === 12 + 96, "chip inset");
expect(chipInsets.right === 16 + 200, "compact detail inset");

expect(fitDistanceScale(752, 900, insets) > 1, "pull back when overlays eat the view");
expect(fitDistanceScale(800, 600, { left: 0, right: 0, top: 0, bottom: 0 }) === 1, "no inset is 1×");
const pan = fitPanNdc(800, 600, { left: 292, right: 16, top: 64, bottom: 24 });
expect(pan.x > 0, "tree on the left shifts remaining center right");
expect(pan.y < 0, "toolbar on top shifts remaining center down in NDC");

const roomy = toolbarLayout({ canvasWidth: 752, leftReserve: 12, rightReserve: 48 });
expect(roomy.stacked === false, "wide canvas keeps toolbar on the top row");
expect(roomy.top === TOOLBAR_TOP, "top-4");
const squeezed = toolbarLayout({ canvasWidth: 210, leftReserve: 48, rightReserve: 48 });
expect(squeezed.stacked, "tiny canvas offsets the toolbar");
expect(squeezed.top === TOOLBAR_TOP, "stays on the top row, not over PartTree");
expect(squeezed.left >= 12, "offset toolbar stays on the canvas");

expect(toolbarRightReserve(false, false) === 12, "padding only");
expect(toolbarRightReserve(true, false) === 12 + 44, "chat toggle");
expect(toolbarRightReserve(false, true) === 12 + 140, "Enter Studio");
expect(toolbarRightReserve(true, true) === 12 + 140 + 44 + 8, "both plus gap");

const needed = FILES_RAIL_WIDTH + CHAT_MIN_WIDTH + CANVAS_MIN_WIDTH;
expect(needed === 1064, "rail + min chat + canvas");
expect(isCompactChat(needed - 1, true), "one pixel under the floor sheets chat");
expect(chatLayoutWidth(720, needed, true) === 280, "at the floor chat is min width");
expect(needed - FILES_RAIL_WIDTH - 280 === CANVAS_MIN_WIDTH, "canvas keeps 480 when docked at the floor");

console.log("layout.selfcheck ok");
