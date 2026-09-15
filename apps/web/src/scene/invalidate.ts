let invalidateScene: (() => void) | null = null;

export function bindSceneInvalidate(fn: (() => void) | null) {
  invalidateScene = fn;
}

export function invalidateSceneNow() {
  invalidateScene?.();
}
