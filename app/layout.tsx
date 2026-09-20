import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";

const display = Sora({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "ArrowFlow — Daily Path Puzzles",
  description:
    "Trace the path, obey the arrows, beat the grid. Daily puzzles, endless runs, and timed challenges.",
};

export const viewport: Viewport = {
  themeColor: "#0b1023",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body min-h-screen antialiased">{children}</body>
    </html>
  );
}
