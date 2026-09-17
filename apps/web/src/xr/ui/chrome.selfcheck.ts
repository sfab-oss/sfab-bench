import {
  type ChromeOpts,
  classify,
  HIT_PAD,
  handleCenterY,
  PX,
  type Region,
} from "./chrome";

const W = 204;
const H = 340;
const hw = (W * PX) / 2;
const hh = (H * PX) / 2;
const band = 0.009 + 0.003 / 2 + HIT_PAD;
const opts: ChromeOpts = { handle: true };

function expect(
  x: number,
  y: number,
  want: Region,
  label: string,
  o: ChromeOpts = {}
) {
  const got = classify(x, y, W, H, HIT_PAD, o);
  if (got !== want) {
    throw new Error(
      `${label}: expected ${want}, got ${got} at (${x.toFixed(4)}, ${y.toFixed(4)})`
    );
  }
}

expect(0, 0, "none", "face centre");
expect(0, -hh + 0.003, "none", "face just above bottom, handle on", opts);
expect(0, hh + band / 2, "edge:t", "top edge mid");
expect(hw + band / 2, 0, "edge:r", "right edge mid");
expect(-(hw + band / 2), 0, "edge:l", "left edge mid");
expect(0, -(hh + band / 2), "none", "bottom band is not a move edge");
expect(hw + band / 2, hh + band / 2, "corner:tr", "top-right outside");
expect(-(hw + band / 2), hh + band / 2, "corner:tl", "top-left outside");
expect(hw + band / 2, -(hh + band / 2), "corner:br", "bottom-right outside");
expect(-(hw + band / 2), -(hh + band / 2), "corner:bl", "bottom-left outside");
expect(hw + 0.2, 0, "none", "far outside");
expect(0, hh + 0.001, "edge:t", "gap between face and outline, top");

const hy = handleCenterY(hh);
expect(0, hy, "handle", "pill centre", opts);
expect(0.04, hy, "handle", "pill tip", opts);
expect(0, hy - 0.03, "none", "just outside pill", opts);
expect(0, -(hh + band / 2), "none", "bottom band without handle");

const R = 0.04;
expect(0, 0, "none", "orb interior", { shape: "orb", radius: R });
expect(R + band / 2, 0, "ring", "orb ring", { shape: "orb", radius: R });
expect(R + 0.2, 0, "none", "outside orb", { shape: "orb", radius: R });

console.log("chrome.selfcheck ok");
