"use client";

import { useRef } from "react";
import { LevelResult, Puzzle } from "@/lib/types";
import { useMazeGame } from "@/hooks/useMazeGame";
import { computeLevelScore } from "@/lib/scoring";
import { MazeCanvas } from "./MazeCanvas";
import { LivesRow } from "./LivesRow";
import { LightbulbIcon } from "./icons";

interface MazeGameViewProps {
  puzzle: Puzzle;
  lives: number;
  onMistake: () => void;
  onComplete: (result: LevelResult) => void;
}

/**
 * Owns one level's play session. Must be mounted with `key={puzzle.id}` by
 * the caller — a fresh mount per puzzle keeps this component's internal
 * game state (via useMazeGame) always in sync with `puzzle`'s own
 * dimensions, since React fully re-initializes on a key change rather than
 * patching state in during a later effect (which left a one-frame window
 * where old state could be read against a new, differently-sized puzzle).
 */
export function MazeGameView({ puzzle, lives, onMistake, onComplete }: MazeGameViewProps) {
  const startedAtRef = useRef(Date.now());

  const game = useMazeGame({
    puzzle,
    onMistake,
    onAllComplete: () => {
      const { stars, coinsEarned } = computeLevelScore({
        tier: puzzle.tier,
        mistakes: game.mistakes,
        hintsUsed: game.hintsUsed,
        pieceCount: puzzle.cols * puzzle.rows,
      });
      onComplete({
        level: puzzle.level,
        completed: true,
        mistakes: game.mistakes,
        hintsUsed: game.hintsUsed,
        elapsedMs: Date.now() - startedAtRef.current,
        stars,
        coinsEarned,
      });
    },
  });

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <LivesRow lives={lives} />
        <button
          onClick={game.requestHint}
          disabled={game.hintsUsed >= game.maxHints}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-40 bg-chip text-accent"
        >
          <LightbulbIcon className="w-3.5 h-3.5" />
          Hint ({game.maxHints - game.hintsUsed})
        </button>
      </div>
      <MazeCanvas
        puzzle={puzzle}
        present={game.present}
        flashPieceId={game.flashPieceId}
        hintPieceId={game.hintPieceId}
        onTap={game.tapCell}
      />
      <p className="text-center text-[11px] text-sub2 mt-3">
        {game.clearedCount}/{game.totalPieces} pieces cleared &mdash; tap a piece to send it sliding off the board
        the way its arrow points. A blocked tap costs a life.
      </p>
    </>
  );
}
