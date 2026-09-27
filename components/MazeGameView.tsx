"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pictureForLevel, pictureLayerFor } from "@/lib/pictures";
import { LevelResult, Puzzle } from "@/lib/types";
import { LevelSummary, useMazeGame } from "@/hooks/useMazeGame";
import { computeLevelScore } from "@/lib/scoring";
import { MazeCanvas } from "./MazeCanvas";
import { LivesRow } from "./LivesRow";
import { BoosterBar } from "./BoosterBar";

interface MazeGameViewProps {
  puzzle: Puzzle;
  onMistake: () => void;
  onComplete: (result: LevelResult) => void;
  /** Called when the level's lives run out. The board stays as it is. */
  onOutOfLives: (offerExtraLife: () => void) => void;
}

/** Successive taps of the zoom booster cycle through these scales. */
const ZOOM_STEPS = [1, 1.5, 2.25];

/**
 * The biggest a cell is ever drawn, in CSS pixels. Without a cap a small
 * board is blown up to fill the screen — level 1's handful of cells came
 * out over 100px each — so every board ends up the same rectangle however
 * little is in it. Capping the cell size lets the canvas grow with the
 * puzzle instead: a small board draws small and centred, and boards keep
 * getting visibly bigger until they fill the space available.
 */
const MAX_CELL_PX = 40;

/**
 * How wide to draw the board, given the space available.
 *
 * The whole board is always visible: it never exceeds the space it is given
 * on either axis, so there is nothing to scroll to until the player zooms
 * in. Within that, the canvas is sized by the puzzle rather than always
 * filling the frame — cells are drawn at MAX_CELL_PX until the board grows
 * big enough that fitting it needs them smaller.
 */
export function boardWidthFor(frameWidth: number, frameHeight: number, cols: number, rows: number): number {
  const fitBothAxes = Math.min(frameWidth, (frameHeight * cols) / rows);
  return Math.min(fitBothAxes, cols * MAX_CELL_PX);
}

/**
 * Owns one level's play session. Must be mounted with `key={puzzle.id}` by
 * the caller — a fresh mount per puzzle keeps this component's internal
 * game state (via useMazeGame) always in sync with `puzzle`'s own
 * dimensions, since React fully re-initializes on a key change rather than
 * patching state in during a later effect (which left a one-frame window
 * where old state could be read against a new, differently-sized puzzle).
 */
export function MazeGameView({ puzzle, onMistake, onComplete, onOutOfLives }: MazeGameViewProps) {
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
    // The summary comes from the hook rather than being read back off it:
    // the last clear's own counts are not in `game` yet when this runs.
    onAllComplete: (summary: LevelSummary) => {
      const { stars, coinsEarned } = computeLevelScore({
        tier: puzzle.tier,
        mistakes: summary.mistakes,
        hintsUsed: summary.hintsUsed,
        pieceCount: puzzle.cols * puzzle.rows,
      });
      onComplete({
        level: puzzle.level,
        completed: true,
        mistakes: summary.mistakes,
        hintsUsed: summary.hintsUsed,
        elapsedMs: Date.now() - startedAtRef.current,
        stars,
        coinsEarned,
        piecesCleared: summary.piecesCleared,
        bestStreak: summary.bestStreak,
        pictureId: pictureLayer ? pictureForLevel(puzzle.level).id : undefined,
      });
    },
  });

  // Reported upwards rather than handled here: the board stays put while the
  // page decides what to offer, so a granted life resumes the same level
  // rather than dealing a new board.
  const { outOfLives, grantExtraLife } = game;
  useEffect(() => {
    if (outOfLives) onOutOfLives(grantExtraLife);
  }, [outOfLives, grantExtraLife, onOutOfLives]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-2">
        <LivesRow lives={game.livesLeft} />
        {/* Counts down rather than up: what is left to do is the number the
            player is actually working against. */}
        <div className="font-extrabold text-sub tabular-nums">
          <span className="text-base">{game.remainingPieces}</span>
          <span className="text-[11px] text-sub2"> / {game.totalPieces} left</span>
        </div>
      </div>

      {/* The board takes whatever height is left and scrolls only once
          zoomed in, so the booster bar below always stays put and reachable.
          `m-auto` centres the board without making a zoomed-in one's
          overflow unreachable, which centring on the flex container would. */}
      <div ref={frameRef} className="flex-1 min-h-0 overflow-auto flex">
        <div className="m-auto shrink-0" style={{ width: fittedWidth ? fittedWidth * zoom : "100%" }}>
          <MazeCanvas
            puzzle={puzzle}
            present={game.present}
            pictureLayer={pictureLayer}
            exitingPieces={game.exitingPieces}
            flashPieceId={game.flashPieceId}
            hintPieceId={game.hintPieceId}
            queuedIds={game.queuedIds}
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
