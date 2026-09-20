"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateDailyPuzzle } from "@/lib/dailySeed";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { isDailyCompletedToday, applyResult } from "@/lib/storage";
import { ArrowGrid } from "@/components/ArrowGrid";
import { HUD } from "@/components/HUD";
import { ResultModal } from "@/components/ResultModal";
import { GameHeader } from "@/components/GameHeader";
import { PuzzleResult } from "@/lib/types";

export default function DailyPage() {
  const router = useRouter();
  const puzzle = useMemo(() => generateDailyPuzzle(), []);
  const { profile, hydrated, submitResult } = usePlayerProfile();
  const [alreadyDoneBefore, setAlreadyDoneBefore] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<ReturnType<typeof applyResult> | null>(null);

  useEffect(() => {
    if (hydrated && alreadyDoneBefore === null) {
      setAlreadyDoneBefore(isDailyCompletedToday(profile));
    }
  }, [hydrated, alreadyDoneBefore, profile]);

  const handleComplete = (result: PuzzleResult) => {
    if (!alreadyDoneBefore) {
      setOutcome(submitResult(result));
    }
  };

  const engine = useGameEngine({ puzzle, mode: "daily", onComplete: handleComplete });

  if (!hydrated || alreadyDoneBefore === null) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="h-64 rounded-2xl bg-panel/50 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-8 flex flex-col gap-5">
      <GameHeader title="Daily Puzzle" subtitle={`Difficulty ${puzzle.difficulty} · ${puzzle.size}×${puzzle.size} grid`} />

      {alreadyDoneBefore && !engine.completed && (
        <div className="rounded-xl bg-warn/10 text-warn text-sm px-4 py-3">
          You already solved today&apos;s puzzle. Playing again is just for fun — come back tomorrow for a new one.
        </div>
      )}

      <HUD
        elapsedMs={engine.elapsedMs}
        movesLabel={`${engine.playerMoves} moves`}
        hintsUsed={engine.hintsUsed}
        maxHints={engine.maxHints}
        onHint={engine.requestHint}
        onUndo={engine.undo}
        canUndo={engine.canUndo}
      />

      <ArrowGrid
        puzzle={puzzle}
        path={engine.path}
        onCellSelect={engine.selectCell}
        hintCell={engine.hintCell}
        disabled={engine.completed}
      />

      <p className="text-center text-xs text-white/40">
        Tap the highlighted tiles to trace a path from <span className="text-accent2">START</span> to{" "}
        <span className="text-warn">END</span>. Arrow tiles force which way you leave them.
      </p>

      {engine.result && (
        <ResultModal
          result={engine.result}
          leveledUp={outcome?.leveledUp}
          newLevel={outcome?.newLevel}
          streakContinued={outcome?.streakContinued}
          streakCount={outcome?.profile.dailyStreak}
          note={alreadyDoneBefore ? "Practice run — no rewards this time." : undefined}
          primaryLabel="Back to Home"
          onPrimary={() => router.push("/")}
        />
      )}
    </main>
  );
}
