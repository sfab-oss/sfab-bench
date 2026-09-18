import { keepWrapSpaces } from "./UikitMarkdown";
import { xrScrollAtLiveEdge } from "./useXrChatScroll";

function expect(got: unknown, want: unknown, label: string) {
  if (got !== want) {
    throw new Error(
      `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
    );
  }
}

expect(keepWrapSpaces(" VR "), "\u00a0VR\u00a0", "wrap spaces at both ends");
expect(keepWrapSpaces("  a"), "\u00a0\u00a0a", "leading spaces");
expect(keepWrapSpaces("a  "), "a\u00a0\u00a0", "trailing spaces");
expect(keepWrapSpaces("a b"), "a b", "inner spaces unchanged");
expect(keepWrapSpaces(""), "", "empty");

expect(xrScrollAtLiveEdge(0, 0), true, "empty list is at edge");
expect(xrScrollAtLiveEdge(100, 100), true, "exactly at end");
expect(xrScrollAtLiveEdge(100, 80), true, "within 24px edge");
expect(xrScrollAtLiveEdge(100, 70), false, "away from end");

console.log("xr-card-sync.selfcheck ok");
