"use client";

import { BoltIcon, ClockIcon, LightbulbIcon, UndoIcon } from "./icons";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface HUDProps {
  elapsedMs: number;
  movesLabel: string;
  hintsUsed: number;
  maxHints: number;
  onHint: () => void;
  onUndo: () => void;
  canUndo: boolean;
  extraRight?: React.ReactNode;
}

export function HUD({ elapsedMs, movesLabel, hintsUsed, maxHints, onHint, onUndo, canUndo, extraRight }: HUDProps) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 text-sm text-white/70">
        <span className="flex items-center gap-1.5 font-display font-semibold text-white">
          <ClockIcon className="w-4 h-4 text-accent2" />
          {formatTime(elapsedMs)}
        </span>
        <span className="flex items-center gap-1.5">
          <BoltIcon className="w-4 h-4 text-accent" />
          {movesLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {extraRight}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel2 text-sm text-white/80 disabled:opacity-30 hover:bg-panel2/70 transition-colors"
        >
          <UndoIcon className="w-4 h-4" />
          Undo
        </button>
        <button
          onClick={onHint}
          disabled={hintsUsed >= maxHints}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent2 text-sm disabled:opacity-30 hover:bg-accent/30 transition-colors"
        >
          <LightbulbIcon className="w-4 h-4" />
          Hint ({maxHints - hintsUsed})
        </button>
      </div>
    </div>
  );
}
