"use client";

import { useEffect, useState } from "react";
import { generateFullCoveragePuzzle } from "@/lib/generator";
import { Puzzle } from "@/lib/types";
import { MazeGrid } from "@/components/MazeGrid";
import { WaterDropIcon, PaletteIcon, SettingsIcon, LightbulbIcon } from "@/components/icons";

/**
 * Scratch preview of the new dense full-coverage maze visual style — not
 * wired into navigation yet. Static trail (no drag interaction) until the
 * look is signed off.
 */
export default function MazePreviewPage() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  useEffect(() => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    setPuzzle(generateFullCoveragePuzzle({ mode: "endless", size: 9, seed }));
  }, []);

  if (!puzzle) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f2e8d3" }}>
        <p className="text-[#6b4a35]">Building maze…</p>
      </main>
    );
  }

  // Fake a partial trail from the start, just for the preview screenshot.
  const trail = puzzle.parPath.slice(0, Math.floor(puzzle.parPath.length * 0.4));

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#f2e8d3" }}>
      <div className="mx-auto max-w-lg px-4 py-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <button className="text-2xl text-[#6b4a35]/70">←</button>
          <div className="text-center">
            <div className="font-display text-xl font-extrabold text-[#c9843b]">Level 42</div>
            <div className="text-xs font-bold text-[#c0483f] uppercase tracking-wide">Hard</div>
          </div>
          <div className="flex items-center gap-2">
            <PaletteIcon className="w-6 h-6 text-[#6b4a35]/70" />
            <SettingsIcon className="w-6 h-6 text-[#6b4a35]/70" />
          </div>
        </div>

        <div className="h-px bg-[#6b4a35]/15" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 3 }, (_, i) => (
              <WaterDropIcon key={i} className="w-7 h-7 text-[#3fa9e0]" />
            ))}
          </div>
          <button className="relative flex items-center justify-center w-11 h-11 rounded-full bg-white/60 text-[#6b4a35]">
            <LightbulbIcon className="w-5 h-5" />
            <span className="absolute -top-1.5 -right-1.5 bg-[#d98a2b] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              AD
            </span>
          </button>
        </div>

        <MazeGrid puzzle={puzzle} trail={trail} />
      </div>
    </main>
  );
}
