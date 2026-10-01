import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Permanent once published on Play — change it before the first upload, never after.
  appId: "com.spacemanclub.arrowflow",
  appName: "ArrowFlow",
  // `next build` with output: "export" writes the static site here.
  webDir: "out",
  android: {
    // A puzzle game has no use for remote debugging in a release build.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      // The page sets viewport-fit=cover and pads itself with
      // env(safe-area-inset-*); telling Capacitor up front avoids a layout jump.
      initialViewportFitValueHint: "cover",
    },
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#e9dfc9",
      showSpinner: false,
    },
  },
};

export default config;
