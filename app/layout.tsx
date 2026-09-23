import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Sora, Inter } from "next/font/google";
import { ADSENSE_CLIENT, ADSENSE_TEST_MODE } from "@/lib/ads";
import "./globals.css";

const display = Sora({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "ArrowFlow",
  description: "Drag out each line to clear the maze. Calm, single-tone puzzles that scale from easy to hardest.",
};

export const viewport: Viewport = {
  themeColor: "#cdd6d8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body min-h-screen antialiased">
        {children}
        {ADSENSE_CLIENT && <AdSenseGameAds />}
      </body>
    </html>
  );
}

/**
 * AdSense H5 Games Ads. adBreak/adConfig are defined up front as pushes onto
 * the adsbygoogle queue, so the game can call them before the library has
 * finished loading; lib/ads.ts is the only caller.
 */
function AdSenseGameAds() {
  return (
    <>
      <Script
        id="adsense-h5"
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-frequency-hint="30s"
        {...(ADSENSE_TEST_MODE ? { "data-adbreak-test": "on" } : {})}
      />
      <Script id="adsense-h5-init" strategy="afterInteractive">
        {`window.adsbygoogle = window.adsbygoogle || [];
window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
window.adConfig({ preloadAdBreaks: "on", sound: "on" });`}
      </Script>
    </>
  );
}
