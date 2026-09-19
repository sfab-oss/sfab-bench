import {
  XR_COMPOSER_MAX_H,
  XR_COMPOSER_MIN_H,
  xrComposerHeight,
} from "./xrChatChrome";

function expect(got: unknown, want: unknown, label: string) {
  if (got !== want) {
    throw new Error(
      `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
    );
  }
}

expect(xrComposerHeight(""), XR_COMPOSER_MIN_H, "empty stays min");
expect(xrComposerHeight("hi"), XR_COMPOSER_MIN_H, "one short line stays min");
expect(xrComposerHeight("a\nb"), 52, "two explicit lines");
expect(
  xrComposerHeight("x".repeat(32)),
  XR_COMPOSER_MIN_H,
  "exactly one wrap unit"
);
expect(xrComposerHeight("x".repeat(33)), 52, "wraps onto a second line");
expect(
  xrComposerHeight("x".repeat(32 * 20)),
  XR_COMPOSER_MAX_H,
  "long wrap caps"
);
expect(
  xrComposerHeight("a\n".repeat(20)),
  XR_COMPOSER_MAX_H,
  "many newlines cap"
);

console.log("xr-chat-chrome.selfcheck ok");
