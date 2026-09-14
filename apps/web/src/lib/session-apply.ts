let depth = 0;

export function beginApplyingSession() {
  depth += 1;
}

export function endApplyingSession() {
  depth = Math.max(0, depth - 1);
}

export function isApplyingSession() {
  return depth > 0;
}

export function applyingSession<T>(fn: () => T): T {
  beginApplyingSession();
  try {
    return fn();
  } finally {
    endApplyingSession();
  }
}
