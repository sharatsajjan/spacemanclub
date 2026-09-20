"use client";

import { PuzzleResult } from "@/lib/types";
import { StarRow } from "./StarRow";

interface ResultModalProps {
  result: PuzzleResult;
  leveledUp?: boolean;
  newLevel?: number;
  streakContinued?: boolean;
  streakCount?: number;
  note?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function ResultModal({
  result,
  leveledUp,
  newLevel,
  streakContinued,
  streakCount,
  note,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ResultModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-panel ring-1 ring-white/10 shadow-glow p-6 animate-pop">
        <div className="text-center">
          <p className="text-accent2 font-display font-semibold uppercase tracking-wide text-xs mb-1">
            Solved
          </p>
          <h2 className="font-display text-2xl font-bold text-white mb-1">Nice routing!</h2>
          {note && <p className="text-xs text-white/50 mb-2">{note}</p>}
          <div className="flex justify-center mb-4">
            <StarRow stars={result.stars} size="lg" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <Stat label="Score" value={result.score.toString()} />
            <Stat label="Moves" value={`${result.playerMoves}/${result.parMoves}`} />
            <Stat label="XP" value={`+${result.xpGained}`} />
          </div>
          {leveledUp && (
            <div className="mb-3 rounded-lg bg-accent/20 text-accent2 text-sm font-semibold py-2">
              Level up! You&apos;re now level {newLevel}.
            </div>
          )}
          {streakContinued && streakCount && (
            <div className="mb-3 rounded-lg bg-warn/15 text-warn text-sm font-semibold py-2">
              🔥 {streakCount}-day streak!
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onPrimary}
            className="w-full rounded-xl bg-accent hover:bg-accent/90 transition-colors text-white font-display font-semibold py-3"
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="w-full rounded-xl bg-transparent hover:bg-white/5 transition-colors text-white/70 font-medium py-2 text-sm"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel2 py-2">
      <div className="font-display font-bold text-white text-lg">{value}</div>
      <div className="text-[11px] text-white/50 uppercase tracking-wide">{label}</div>
    </div>
  );
}
