import { Svg } from "@react-three/uikit";

import type { HarnessId } from "@/lib/harness";
import { providerSvgContent } from "@/lib/provider-marks";

export function XrProviderMark({
  id,
  size = 16,
}: {
  id: HarnessId;
  size?: number;
}) {
  return (
    <Svg
      content={providerSvgContent(id)}
      width={size}
      height={size}
      keepAspectRatio
    />
  );
}
