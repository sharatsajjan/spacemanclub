import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";
import { NativeBridge } from "@/components/NativeBridge";

const display = Sora({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "ArrowFlow",
  description: "Drag out each line to clear the maze. Calm, single-tone puzzles that scale from easy to hardest.",
};

export const viewport: Viewport = {
  themeColor: "#e6dccb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Draw under the system bars (Android 15+ is edge-to-edge regardless) and
  // pad with env(safe-area-inset-*) in globals.css instead.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body min-h-screen antialiased">
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
