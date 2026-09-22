"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { pictureForLevel, pictureLayerFor } from "@/lib/pictures";
import { LevelResult, Puzzle } from "@/lib/types";
import { useMazeGame } from "@/hooks/useMazeGame";
import { computeLevelScore } from "@/lib/scoring";
import { MazeCanvas } from "./MazeCanvas";
import { LivesRow } from "./LivesRow";
import { BoosterBar } from "./BoosterBar";

interface MazeGameViewProps {
  puzzle: Puzzle;
  lives: number;
  onMistake: () => void;
  onComplete: (result: LevelResult) => void;
}

/** Successive taps of the zoom booster cycle through these scales. */
const ZOOM_STEPS = [1, 1.5, 2.25];

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
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = ZOOM_STEPS[zoomStep];

  // The board's width is computed rather than left to CSS: it has to fit
  // whichever axis binds (a tall board is height-bound, a wide one
  // width-bound) while keeping cells square, and zoom has to scale that
  // fitted size — expressing all three as CSS constraints at once ends up
  // either stretching the cells or making the zoom steps mean nothing.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [fittedWidth, setFittedWidth] = useState(0);
  const pictureLayer = useMemo(() => pictureLayerFor(puzzle.level, puzzle.cols, puzzle.rows), [puzzle.level, puzzle.cols, puzzle.rows]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setFittedWidth(Math.floor(Math.min(width, (height * puzzle.cols) / puzzle.rows)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [puzzle.cols, puzzle.rows]);

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
        pictureId: pictureLayer ? pictureForLevel(puzzle.level).id : undefined,
      });
    },
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-2">
        <LivesRow lives={lives} />
        <div className="text-[11px] font-bold text-sub2 tabular-nums">
          {game.clearedCount}/{game.totalPieces} cleared
        </div>
      </div>

      {/* The board takes whatever height is left and scrolls once zoomed in,
          so the booster bar below always stays put and reachable. Sizing is
          driven by aspect-ratio against BOTH axes, so a tall board fills the
          available height instead of being capped by its width and leaving a
          dead strip above the boosters. `m-auto` rather than centring on the
          flex container, which would clip the top edge once zoomed. */}
      <div ref={frameRef} className="flex-1 min-h-0 overflow-auto flex">
        <div className="m-auto shrink-0" style={{ width: fittedWidth ? fittedWidth * zoom : "100%" }}>
          <MazeCanvas
            puzzle={puzzle}
            present={game.present}
            pictureLayer={pictureLayer}
            exitingPieces={game.exitingPieces}
            flashPieceId={game.flashPieceId}
            hintPieceId={game.hintPieceId}
            onTap={game.tapCell}
          />
        </div>
      </div>

      <BoosterBar
        onUndo={game.undoLastClear}
        undosLeft={game.maxUndos - game.undosUsed}
        canUndo={game.canUndo}
        onHint={game.requestHint}
        hintsLeft={game.maxHints - game.hintsUsed}
        onZoom={() => setZoomStep((s) => (s + 1) % ZOOM_STEPS.length)}
        zoom={zoom}
      />
    </div>
  );
}
