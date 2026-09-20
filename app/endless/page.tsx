"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePuzzle } from "@/lib/generator";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { recordEndlessRun } from "@/lib/storage";
import { ArrowGrid } from "@/components/ArrowGrid";
import { HUD } from "@/components/HUD";
import { LivesIndicator } from "@/components/LivesIndicator";
import { GameHeader } from "@/components/GameHeader";
import { StarRow } from "@/components/StarRow";
import { InfinityIcon } from "@/components/icons";
import { Coord, PuzzleResult } from "@/lib/types";

const START_LIVES = 3;

type Phase = "intro" | "playing" | "finished";

export default function EndlessPage() {
  const router = useRouter();
  const { profile, hydrated, submitResult, setProfile } = usePlayerProfile();

  const [phase, setPhase] = useState<Phase>("intro");
  const [lives, setLives] = useState(START_LIVES);
  const [runLevel, setRunLevel] = useState(1);
  const [solvedCount, setSolvedCount] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [starsThisRun, setStarsThisRun] = useState(0);
  const [seed, setSeed] = useState(0);
  const [runRecorded, setRunRecorded] = useState(false);
  const [newBest, setNewBest] = useState(false);

  const puzzle = useMemo(() => generatePuzzle({ mode: "endless", difficulty: runLevel, seed }), [runLevel, seed]);

  const handleComplete = (result: PuzzleResult) => {
    submitResult(result);
    setRunScore((s) => s + result.score);
    setStarsThisRun((s) => s + result.stars);
    setSolvedCount((c) => c + 1);
    setRunLevel((l) => l + 1);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
  };

  const engine = useGameEngine({ puzzle, mode: "endless", onComplete: handleComplete });

  const handleWrongMove = (_coord: Coord) => {
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) setPhase("finished");
      return Math.max(0, next);
    });
  };

  useEffect(() => {
    if (phase !== "finished" || runRecorded) return;
    setRunRecorded(true);
    setNewBest(runLevel > profile.endlessBestLevel);
    setProfile((p) => recordEndlessRun(p, { finalLevel: runLevel, totalScore: runScore }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runRecorded]);

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="h-64 rounded-2xl bg-panel/50 animate-pulse" />
      </main>
    );
  }

  const startRun = () => {
    setLives(START_LIVES);
    setRunLevel(1);
    setSolvedCount(0);
    setRunScore(0);
    setStarsThisRun(0);
    setRunRecorded(false);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
    setNewBest(false);
    setPhase("playing");
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-8 flex flex-col gap-5">
      <GameHeader
        title="Endless"
        subtitle={phase === "playing" ? `Level ${runLevel} · ${puzzle.size}×${puzzle.size} grid` : "3 lives, no mercy"}
        right={phase === "playing" ? <LivesIndicator lives={lives} maxLives={START_LIVES} /> : null}
      />

      {phase === "intro" && (
        <div className="rounded-2xl bg-panel ring-1 ring-white/10 p-6 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent2/15 flex items-center justify-center">
            <InfinityIcon className="w-7 h-7 text-accent2" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white mb-1">3 lives. How deep can you go?</h2>
            <p className="text-sm text-white/60 max-w-xs">
              Every wrong or blocked tap costs a life. Puzzles get bigger and trickier as you climb levels —
              the run ends when you&apos;re out of lives.
            </p>
          </div>
          <button
            onClick={startRun}
            className="rounded-xl bg-accent2 hover:bg-accent2/90 transition-colors text-ink font-display font-semibold py-3 px-8"
          >
            Start Run
          </button>
          {profile.endlessBestLevel > 1 && (
            <p className="text-xs text-white/40">Best level reached: {profile.endlessBestLevel}</p>
          )}
        </div>
      )}

      {phase === "playing" && (
        <>
          <HUD
            elapsedMs={engine.elapsedMs}
            movesLabel={`${engine.playerMoves} moves`}
            hintsUsed={engine.hintsUsed}
            maxHints={engine.maxHints}
            onHint={engine.requestHint}
            onUndo={engine.undo}
            canUndo={engine.canUndo}
            extraRight={<span className="text-sm font-display font-bold text-accent2">{runScore} pts</span>}
          />
          <ArrowGrid
            puzzle={puzzle}
            path={engine.path}
            onCellSelect={engine.selectCell}
            onWrongMove={handleWrongMove}
            hintCell={engine.hintCell}
            disabled={engine.completed || phase !== "playing"}
          />
          <p className="text-center text-xs text-white/40">
            Tap a wrong or blocked tile and it costs a life — the grid flashes red so you know it happened.
          </p>
        </>
      )}

      {phase === "finished" && (
        <div className="rounded-2xl bg-panel ring-1 ring-white/10 p-6 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-danger font-display font-semibold uppercase tracking-wide text-xs mb-1">
              Out of lives
            </p>
            <h2 className="font-display text-3xl font-extrabold text-white">Level {runLevel}</h2>
            <div className="flex justify-center mt-2">
              <StarRow stars={Math.min(3, Math.round(starsThisRun / Math.max(1, solvedCount)))} />
            </div>
            <p className="text-sm text-white/50 mt-2">
              {runScore} pts · {solvedCount} puzzle{solvedCount === 1 ? "" : "s"} solved
            </p>
            {newBest && <p className="text-xs text-accent2 mt-1">New best level!</p>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={startRun}
              className="flex-1 rounded-xl bg-accent2 hover:bg-accent2/90 transition-colors text-ink font-display font-semibold py-3"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 rounded-xl bg-panel2 hover:bg-panel2/70 transition-colors text-white/70 font-semibold py-3"
            >
              Home
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
