import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNativeApp } from "./native";

/**
 * Thin wrapper over two backends: the native Haptics plugin inside the
 * Android app (the WebView's Vibration API is unreliable there), and the Web
 * Vibration API in a browser. Feature-detected and error-swallowing since
 * it's unsupported on iOS Safari and any backend can throw or reject
 * (permissions, non-secure context) — a missing buzz should never break
 * gameplay.
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // unsupported or blocked — silently no-op
  }
}

function native(run: () => Promise<void>): void {
  run().catch(() => {
    // no vibrator, or disabled in system settings — silently no-op
  });
}

/** Piece cleared successfully: short, light confirmation pulse. */
export function hapticSuccess(): void {
  if (isNativeApp()) return native(() => Haptics.impact({ style: ImpactStyle.Light }));
  vibrate(12);
}

/** Blocked tap (costs a life): a distinct double-pulse so it never feels like success. */
export function hapticMistake(): void {
  if (isNativeApp()) return native(() => Haptics.notification({ type: NotificationType.Error }));
  vibrate([18, 45, 18]);
}

/** Hint highlighted a piece: barely-there nudge, just enough to draw the eye. */
export function hapticHint(): void {
  if (isNativeApp()) return native(() => Haptics.selectionChanged());
  vibrate(8);
}
