"use client";

import { useEffect } from "react";
import { ThemeId } from "@/lib/types";
import { getTheme } from "@/lib/themes";

/** Applies the given theme's colors as CSS variables on the document root. */
export function ThemeStyle({ themeId }: { themeId: ThemeId }) {
  useEffect(() => {
    const theme = getTheme(themeId);
    const root = document.documentElement.style;
    root.setProperty("--outer", theme.outer);
    root.setProperty("--panel", theme.panel);
    root.setProperty("--maze", theme.maze);
    root.setProperty("--text", theme.text);
    root.setProperty("--sub", theme.sub);
    root.setProperty("--sub2", theme.sub2);
    root.setProperty("--accent", theme.accent);
    root.setProperty("--accent2", theme.accent2);
    root.setProperty("--accent3", theme.accent3);
    root.setProperty("--line", theme.line);
    root.setProperty("--line-done", theme.lineDone);
    root.setProperty("--btn-text", theme.btnText);
    root.setProperty("--chip", theme.chip);
    root.setProperty("--danger", theme.danger);
    theme.piecePalette.forEach((color, i) => root.setProperty(`--piece-${i}`, color));
  }, [themeId]);

  return null;
}
