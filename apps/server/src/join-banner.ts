import { renderUnicodeCompact } from "uqr";

import { publicPort } from "./config";
import { ensureOffer, joinInfo } from "./pairing";

function formatCode(code: string) {
  const compact = code.replace(/\s/g, "");
  return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

export function printJoinBanner(mode: "dev" | "serve") {
  const port = publicPort();
  const offer = ensureOffer();
  const info = joinInfo(offer);
  const mac = `https://127.0.0.1:${port}`;
  const quest = info.pairUrl ?? info.lanUrl;
  const qrValue = info.fragmentUrl ?? info.pairUrl;
  console.log("");
  console.log(mode === "dev" ? "[dev] sfab-bench" : "[serve] sfab-bench");
  console.log(`  Mac     ${mac}`);
  if (quest) console.log(`  Quest   ${quest}`);
  else console.log("  Quest   (no LAN address — connect this Mac to Wi-Fi)");
  console.log(`  Code    ${formatCode(info.code)}  (about five minutes, single use)`);
  if (qrValue) {
    console.log("");
    console.log(renderUnicodeCompact(qrValue));
    console.log("");
    console.log(`  Scan    ${qrValue}`);
  }
  console.log("");
}
