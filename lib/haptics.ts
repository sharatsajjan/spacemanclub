/**
 * Thin wrapper around the Web Vibration API. Feature-detected and
 * try/catch-guarded since it's unsupported on iOS Safari and any browser
 * can throw (permissions, non-secure context) — a missing buzz should never
 * break gameplay.
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // unsupported or blocked — silently no-op
  }
}

/** Piece cleared successfully: short, light confirmation pulse. */
export function hapticSuccess(): void {
  vibrate(12);
}

/** Blocked tap (costs a life): a distinct double-pulse so it never feels like success. */
export function hapticMistake(): void {
  vibrate([18, 45, 18]);
}

/** Hint highlighted a piece: barely-there nudge, just enough to draw the eye. */
export function hapticHint(): void {
  vibrate(8);
}
