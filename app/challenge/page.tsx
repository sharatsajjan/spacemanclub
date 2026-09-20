"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePuzzle } from "@/lib/generator";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { recordChallengeRun } from "@/lib/storage";
import { ArrowGrid } from "@/components/ArrowGrid";
import { HUD } from "@/components/HUD";
import { GameHeader } from "@/components/GameHeader";
import { StarRow } from "@/components/StarRow";
import { PuzzleResult } from "@/lib/types";
import { ClockIcon, TrophyIcon } from "@/components/icons";

const RUN_DURATION_MS = 120_000;

function difficultyForStreak(solvedCount: number): number {
  return Math.min(9, 3 + Math.floor(solvedCount / 2));
}

interface LeaderboardEntry {
  name: string;
  score: number;
  date: string;
}

type Phase = "intro" | "playing" | "finished";

export default function ChallengePage() {
  const router = useRouter();
  const { profile, hydrated, submitResult, setProfile } = usePlayerProfile();

  const [phase, setPhase] = useState<Phase>("intro");
  const [timeLeftMs, setTimeLeftMs] = useState(RUN_DURATION_MS);
  const [solvedCount, setSolvedCount] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [starsThisRun, setStarsThisRun] = useState(0);
  const [seed, setSeed] = useState(0);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const difficulty = difficultyForStreak(solvedCount);
  const puzzle = useMemo(() => generatePuzzle({ mode: "challenge", difficulty, seed }), [difficulty, seed]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setTimeLeftMs((t) => {
        if (t <= 200) {
          clearInterval(id);
          setPhase("finished");
          return 0;
        }
        return t - 200;
      });
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "finished") return;
    setProfile((p) => recordChallengeRun(p, runScore));
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => setLeaderboard(data.entries ?? []))
      .catch(() => setLeaderboard([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleComplete = (result: PuzzleResult) => {
    submitResult(result);
    setRunScore((s) => s + result.score);
    setStarsThisRun((s) => s + result.stars);
    setSolvedCount((c) => c + 1);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
  };

  const engine = useGameEngine({ puzzle, mode: "challenge", onComplete: handleComplete });

  const startRun = () => {
    setSolvedCount(0);
    setRunScore(0);
    setStarsThisRun(0);
    setTimeLeftMs(RUN_DURATION_MS);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
    setSubmitted(false);
    setPhase("playing");
  };

  const submitScore = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || profile.playerName || "Player", score: runScore }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeaderboard(data.entries ?? []);
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="h-64 rounded-2xl bg-panel/50 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-8 flex flex-col gap-5">
      <GameHeader
        title="Challenge"
        subtitle={phase === "playing" ? `Puzzle ${solvedCount + 1} · Difficulty ${difficulty}` : "Beat the clock"}
        right={
          phase === "playing" ? (
            <div className="flex items-center gap-1.5 font-display font-bold text-white bg-panel2 px-3 py-1.5 rounded-lg">
              <ClockIcon className="w-4 h-4 text-danger" />
              {(timeLeftMs / 1000).toFixed(0)}s
            </div>
          ) : null
        }
      />

      {phase === "intro" && (
        <div className="rounded-2xl bg-panel ring-1 ring-white/10 p-6 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center">
            <TrophyIcon className="w-7 h-7 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white mb-1">2-minute sprint</h2>
            <p className="text-sm text-white/60 max-w-xs">
              Solve as many puzzles as you can before time runs out. Puzzles get harder the longer you last.
              Your best run score goes on the leaderboard.
            </p>
          </div>
          <button
            onClick={startRun}
            className="rounded-xl bg-accent hover:bg-accent/90 transition-colors text-white font-display font-semibold py-3 px-8"
          >
            Start
          </button>
          {profile.challengeHighScore > 0 && (
            <p className="text-xs text-white/40">Your best: {profile.challengeHighScore} pts</p>
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
            hintCell={engine.hintCell}
            disabled={engine.completed}
          />
        </>
      )}

      {phase === "finished" && (
        <div className="rounded-2xl bg-panel ring-1 ring-white/10 p-6 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-accent2 font-display font-semibold uppercase tracking-wide text-xs mb-1">
              Time&apos;s up
            </p>
            <h2 className="font-display text-3xl font-extrabold text-white">{runScore} pts</h2>
            <div className="flex justify-center mt-2">
              <StarRow stars={Math.min(3, Math.round(starsThisRun / Math.max(1, solvedCount)))} />
            </div>
            <p className="text-sm text-white/50 mt-2">{solvedCount} puzzles solved</p>
          </div>

          {!submitted ? (
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={profile.playerName || "Your name"}
                maxLength={20}
                className="flex-1 rounded-lg bg-panel2 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none ring-1 ring-white/10 focus:ring-accent2"
              />
              <button
                onClick={submitScore}
                disabled={submitting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Submit"}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-accent2">Score submitted!</p>
          )}

          {leaderboard && leaderboard.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-white/40 mb-2">Leaderboard</h3>
              <ol className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
                {leaderboard.slice(0, 10).map((entry, i) => (
                  <li
                    key={`${entry.name}-${entry.date}-${i}`}
                    className="flex items-center justify-between text-sm rounded-lg bg-panel2/60 px-3 py-1.5"
                  >
                    <span className="text-white/70">
                      {i + 1}. {entry.name}
                    </span>
                    <span className="font-display font-bold text-white">{entry.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={startRun}
              className="flex-1 rounded-xl bg-accent hover:bg-accent/90 transition-colors text-white font-display font-semibold py-3"
            >
              Play Again
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
