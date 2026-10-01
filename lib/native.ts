import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

/** True only inside the Android (Capacitor) app — false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Matches the status/navigation bar icons to the theme behind them: dark
 * icons over a light background, light icons over a dark one. The bars are
 * transparent (edge-to-edge), so the theme's outer colour shows through.
 */
export function syncSystemBars(background: string): void {
  if (!isNativeApp()) return;
  const style = isDark(background) ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
  SystemBars.setStyle({ style }).catch(() => {
    // Cosmetic only — never let it break the game.
  });
}

/** Relative luminance below the midpoint, for a #rrggbb colour. */
function isDark(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return false;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
  return l < 0.18;
}
