"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { isNativeApp } from "@/lib/native";

/**
 * Android-only wiring that a browser gets for free. Without it the hardware
 * back button closes the whole app from the middle of a level, since the
 * WebView has no idea the game has screens.
 */
export function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeApp()) return;
    const handle = App.addListener("backButton", () => {
      // Back from any game screen returns home; back from home sends the app
      // to the background the way Android launchers expect, keeping progress
      // and the lives timer intact rather than killing the process.
      if (pathname === "/" || pathname === "") {
        App.minimizeApp();
      } else {
        router.push("/");
      }
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [pathname, router]);

  return null;
}
