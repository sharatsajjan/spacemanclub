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
 * The smallest a cell is ever drawn, in CSS pixels. Shrinking the whole
 * board to fit the screen works while boards are small, but past a certain
 * size it just makes every cell smaller — a late board and a mid board end
 * up occupying the same rectangle, only harder to read and to hit. Below
 * this size the board stops shrinking and starts scrolling instead, so the
 * canvas grows with the puzzle.
 */
const MIN_CELL_PX = 34;

/**
 * How wide to draw the board, given the space available.
 *
 * Small boards fit entirely, on both axes, so the player can see the whole
 * puzzle at once. Once fitting would push cells below MIN_CELL_PX the board
 * fills the frame's width instead and runs off the bottom, scrolling — much
 * better than the same board squeezed into the same rectangle with tiny
 * cells. And if even the full width can't give cells a usable size, the
 * board goes wider than the frame and pans sideways too.
 */
export function boardWidthFor(frameWidth: number, frameHeight: number, cols: number, rows: number): number {
  const fitBothAxes = Math.min(frameWidth, (frameHeight * cols) / rows);
  if (fitBothAxes / cols >= MIN_CELL_PX) return fitBothAxes;
  return Math.max(frameWidth, cols * MIN_CELL_PX);
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
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = ZOOM_STEPS[zoomStep];

  // The board's width is computed rather than left to CSS: it depends on
  // whether the whole board still fits at a usable cell size, and zoom has
  // to scale whatever that resolves to — expressing it as CSS constraints
  // ends up either stretching the cells or making the zoom steps mean
  // nothing.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [fittedWidth, setFittedWidth] = useState(0);
  const pictureLayer = useMemo(() => pictureLayerFor(puzzle.level, puzzle.cols, puzzle.rows), [puzzle.level, puzzle.cols, puzzle.rows]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setFittedWidth(Math.floor(boardWidthFor(width, height, puzzle.cols, puzzle.rows)));
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

      {/* The board takes whatever height is left and scrolls whenever it
          outgrows that — either because the puzzle is big (see
          boardWidthFor) or because it's zoomed in — so the booster bar below
          always stays put and reachable. `m-auto` centres a board that fits
          without making the overflow of one that doesn't unreachable, which
          centring on the flex container would. */}
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
