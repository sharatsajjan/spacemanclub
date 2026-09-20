"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePuzzle } from "@/lib/generator";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { applyResult, bumpEndlessLevel } from "@/lib/storage";
import { ArrowGrid } from "@/components/ArrowGrid";
import { HUD } from "@/components/HUD";
import { ResultModal } from "@/components/ResultModal";
import { GameHeader } from "@/components/GameHeader";
import { PuzzleResult } from "@/lib/types";

export default function EndlessPage() {
  const router = useRouter();
  const { profile, hydrated, submitResult, setProfile } = usePlayerProfile();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [outcome, setOutcome] = useState<ReturnType<typeof applyResult> | null>(null);

  const puzzle = useMemo(
    () => generatePuzzle({ mode: "endless", difficulty: profile.endlessLevel, seed }),
    [profile.endlessLevel, seed]
  );

  const handleComplete = (result: PuzzleResult) => {
    setOutcome(submitResult(result));
  };

  const engine = useGameEngine({ puzzle, mode: "endless", onComplete: handleComplete });

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="h-64 rounded-2xl bg-panel/50 animate-pulse" />
      </main>
    );
  }

  const nextLevel = () => {
    const bumped = bumpEndlessLevel(outcome?.profile ?? profile);
    setProfile(bumped);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
    setOutcome(null);
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-8 flex flex-col gap-5">
      <GameHeader
        title="Endless"
        subtitle={`Level ${profile.endlessLevel} · ${puzzle.size}×${puzzle.size} grid`}
      />

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
        Grids grow, arrows multiply, dead ends appear. No fail state — take your time, or skip ahead with a
        hint.
      </p>

      {engine.result && (
        <ResultModal
          result={engine.result}
          leveledUp={outcome?.leveledUp}
          newLevel={outcome?.newLevel}
          primaryLabel={`Level ${profile.endlessLevel + 1} →`}
          onPrimary={nextLevel}
          secondaryLabel="Back to Home"
          onSecondary={() => router.push("/")}
        />
      )}
    </main>
  );
}
