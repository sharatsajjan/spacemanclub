"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Direction, Puzzle } from "@/lib/types";
import { pieceCanExit } from "@/lib/rules";
import { maxHintsForLevel, maxUndosForLevel } from "@/lib/difficultyWave";
import { EXIT_UNMOUNT_GRACE_MS, exitDurationMs } from "@/lib/exitMotion";
import { hapticHint, hapticMistake, hapticSuccess } from "@/lib/haptics";
import { soundBlocked, soundClear, soundComplete, soundHint, soundQueuedGo, soundUndo } from "@/lib/sound";

interface UseMazeGameOptions {
  puzzle: Puzzle;
  onMistake: () => void;
  onAllComplete: (summary: LevelSummary) => void;
}

/** What the level cost and what it was worth, handed over when it ends. */
export interface LevelSummary {
  mistakes: number;
  hintsUsed: number;
  piecesCleared: number;
  /** The longest run of clears without a blocked tap or an undo. */
  bestStreak: number;
}

/** How long a queued piece waits before leaving once its lane opens. Long
 * enough to read as its own move rather than part of the tap that freed it. */
const QUEUED_EXIT_DELAY_MS = 260;

/**
 * Lives belong to the level, not to the session.
 *
 * They used to be a session-wide allowance that refilled on a timer, so
 * three blocked taps while learning the rule locked a new player out of the
 * game for a quarter of an hour. Per level, running out costs the level and
 * nothing else: the board is there to try again immediately.
 *
 * It also caps the queue for free. A blocked tap marks the piece to leave
 * later, which would solve the board by itself if a player could tap
 * everything — but each one costs a life, so a level allows three.
 */
export const LIVES_PER_LEVEL = 3;

/**
 * Which cells start occupied — derived from the pieces, not filled in.
 *
 * A board is cut to a silhouette, so the space around the shape holds no
 * piece and has to read as EMPTY: a piece slides out through it exactly as
 * it would off the edge of the grid. Filling the grid with `true` would make
 * that space count as a wall and strand every piece facing it.
 */
function makePresentGrid(puzzle: Puzzle): boolean[][] {
  const grid = Array.from({ length: puzzle.rows }, () => new Array(puzzle.cols).fill(false));
  for (const piece of puzzle.pieces) {
    for (const cell of piece.cells) grid[cell.row][cell.col] = true;
  }
  return grid;
}

function buildPieceIdGrid(puzzle: Puzzle): number[][] {
  const grid = Array.from({ length: puzzle.rows }, () => new Array(puzzle.cols).fill(-1));
  for (const piece of puzzle.pieces) {
    for (const cell of piece.cells) grid[cell.row][cell.col] = piece.id;
  }
  return grid;
}

export function useMazeGame({ puzzle, onMistake, onAllComplete }: UseMazeGameOptions) {
  const pieceIdGrid = useMemo(() => buildPieceIdGrid(puzzle), [puzzle]);
  const piecesById = useMemo(() => new Map(puzzle.pieces.map((p) => [p.id, p])), [puzzle]);

  const [present, setPresent] = useState<boolean[][]>(() => makePresentGrid(puzzle));
  const [clearedCount, setClearedCount] = useState(0);
  const [flashPieceId, setFlashPieceId] = useState<number | null>(null);
  const [hintPieceId, setHintPieceId] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  /** Lives granted mid-level, on top of the level's own allowance. */
  const [extraLives, setExtraLives] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  // Pieces mid slide-out animation: kept rendered (in their exit direction)
  // for a short window after they're already removed from `present`, so
  // gameplay logic (what's blocking, what's tappable) updates instantly
  // while the visual only catches up a moment later.
  const [exitingPieces, setExitingPieces] = useState<Map<number, Direction>>(() => new Map());
  /**
   * Pieces the player has tapped while blocked. They stay marked on the
   * board and leave by themselves the moment their lane opens — a wrong tap
   * is a statement of intent rather than only a mistake.
   *
   * There is no separate cap on how many can be queued, because there does
   * not need to be one: queuing costs a life, and lives are per level, so
   * the board can never be queued into solving itself.
   */
  const [queuedIds, setQueuedIds] = useState<number[]>([]);
  /** The run of clears since the last blocked tap or undo, and the best such
   * run this level — both reported at the end. */
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  /** Ids of cleared pieces, most recent last — the undo stack. */
  const [clearHistory, setClearHistory] = useState<number[]>([]);
  const [undosUsed, setUndosUsed] = useState(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const finishedRef = useRef(false);

  const maxHints = useMemo(() => maxHintsForLevel(puzzle.level), [puzzle.level]);
  const maxUndos = useMemo(() => maxUndosForLevel(puzzle.level), [puzzle.level]);
  const totalPieces = puzzle.pieces.length;

  useEffect(() => {
    setPresent(makePresentGrid(puzzle));
    setClearedCount(0);
    setFlashPieceId(null);
    setHintPieceId(null);
    setMistakes(0);
    setExtraLives(0);
    setHintsUsed(0);
    setClearHistory([]);
    setUndosUsed(0);
    setQueuedIds([]);
    setStreak(0);
    setBestStreak(0);
    finishedRef.current = false;
    exitTimeoutsRef.current.forEach((t) => clearTimeout(t));
    exitTimeoutsRef.current.clear();
    setExitingPieces(new Map());
    // The whole puzzle, since the starting grid is now derived from its
    // pieces rather than just its dimensions. A new object arrives once per
    // level, so this still runs exactly when the board changes.
  }, [puzzle]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      exitTimeoutsRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const livesLeft = Math.max(0, LIVES_PER_LEVEL + extraLives - mistakes);
  /** One more try on this level, without restarting the board. */
  const grantExtraLife = useCallback(() => setExtraLives((e) => e + 1), []);

  const triggerFlash = useCallback((pieceId: number) => {
    setFlashPieceId(pieceId);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashPieceId(null), 350);
  }, []);

  const clearPiece = useCallback(
    (id: number, auto = false) => {
      const piece = piecesById.get(id);
      if (!piece) return;
      const next = present.map((r) => r.slice());
      for (const cell of piece.cells) next[cell.row][cell.col] = false;
      setPresent(next);
      setHintPieceId((h) => (h === id ? null : h));
      setClearHistory((h) => [...h, id]);
      setQueuedIds((q) => (q.includes(id) ? q.filter((qid) => qid !== id) : q));
      hapticSuccess();
      // The last piece gets the finishing phrase instead of a pluck, so the
      // two don't land on top of each other. A queued piece leaving on its
      // own is quieter: the player did not just tap it.
      if (clearedCount + 1 < totalPieces) {
        if (auto) soundQueuedGo(piece.cells.length);
        else soundClear(piece.cells.length);
      }

      // A run counts taps the player got right. A piece leaving on its own
      // is not one of those, so it neither extends nor breaks the run.
      if (!auto) {
        setStreak((s) => {
          const next = s + 1;
          setBestStreak((b) => Math.max(b, next));
          return next;
        });
      }

      setExitingPieces((prev) => {
        const nextMap = new Map(prev);
        nextMap.set(id, piece.direction);
        return nextMap;
      });
      const existingTimeout = exitTimeoutsRef.current.get(id);
      if (existingTimeout) clearTimeout(existingTimeout);
      exitTimeoutsRef.current.set(
        id,
        setTimeout(() => {
          exitTimeoutsRef.current.delete(id);
          setExitingPieces((prev) => {
            if (!prev.has(id)) return prev;
            const nextMap = new Map(prev);
            nextMap.delete(id);
            return nextMap;
          });
        }, exitDurationMs(piece, puzzle.cols, puzzle.rows) + EXIT_UNMOUNT_GRACE_MS)
      );

      // Counted here rather than inside the setState updater: React may run
      // an updater while rendering, and finishing the level calls back into
      // the page, which sets state of its own. Doing it in the tap handler
      // keeps that out of anyone's render.
      const nextCount = clearedCount + 1;
      setClearedCount(nextCount);
      if (nextCount === totalPieces) {
        finishedRef.current = true;
        soundComplete(puzzle.level);
        onAllComplete({
          mistakes,
          hintsUsed,
          piecesCleared: totalPieces,
          bestStreak: Math.max(bestStreak, auto ? streak : streak + 1),
        });
      }
    },
    [
      present, clearedCount, piecesById, totalPieces, onAllComplete,
      puzzle.cols, puzzle.rows, puzzle.level, mistakes, hintsUsed, streak, bestStreak,
    ]
  );

  /**
   * Lets queued pieces go once their lane opens.
   *
   * One at a time, on a short delay: a clear can free several queued pieces
   * at once, and firing them together reads as a glitch rather than as the
   * board unwinding. Each one re-runs this effect, so a chain of them leaves
   * in order.
   */
  useEffect(() => {
    if (finishedRef.current || queuedIds.length === 0) return;
    const ready = queuedIds.find((id) => {
      const piece = piecesById.get(id);
      return (
        piece &&
        present[piece.cells[0].row][piece.cells[0].col] &&
        pieceCanExit(present, piece.cells, puzzle.cols, puzzle.rows, piece.direction)
      );
    });
    if (ready === undefined) return;
    const timer = setTimeout(() => clearPiece(ready, true), QUEUED_EXIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queuedIds, present, piecesById, puzzle.cols, puzzle.rows, clearPiece]);

  const tapCell = useCallback(
    (row: number, col: number) => {
      if (finishedRef.current || livesLeft === 0) return;
      const id = pieceIdGrid[row][col];
      if (id === -1 || !present[row][col]) return; // already cleared, no-op

      const piece = piecesById.get(id)!;
      const canExit = pieceCanExit(present, piece.cells, puzzle.cols, puzzle.rows, piece.direction);

      if (canExit) {
        clearPiece(id);
      } else {
        // Blocked: it costs a life, and the piece stays marked. It will go
        // by itself the moment its lane opens, so the tap is not wasted.
        setMistakes((m) => m + 1);
        setStreak(0);
        setQueuedIds((q) => (q.includes(id) ? q : [...q, id]));
        triggerFlash(id);
        hapticMistake();
        soundBlocked();
        onMistake();
      }
    },
    [present, pieceIdGrid, piecesById, puzzle.cols, puzzle.rows, clearPiece, onMistake, triggerFlash, livesLeft]
  );

  const requestHint = useCallback(() => {
    if (finishedRef.current || hintsUsed >= maxHints) return;
    const clearable = puzzle.pieces.filter(
      (piece) =>
        present[piece.cells[0].row][piece.cells[0].col] &&
        pieceCanExit(present, piece.cells, puzzle.cols, puzzle.rows, piece.direction)
    );
    if (clearable.length === 0) return;
    const pick = clearable[Math.floor(Math.random() * clearable.length)];
    setHintsUsed((h) => h + 1);
    setHintPieceId(pick.id);
    hapticHint();
    soundHint();
  }, [present, puzzle.pieces, puzzle.cols, puzzle.rows, hintsUsed, maxHints]);

  /** Puts the most recently cleared piece back. Safe at any point: a piece
   * that was legal to clear is always legal to restore, since putting cells
   * back can only ever block other pieces, never strand one — and anything
   * it now blocks was cleared after it, so it isn't on the board either. */
  const undoLastClear = useCallback(() => {
    if (finishedRef.current || undosUsed >= maxUndos || clearHistory.length === 0) return;
    const id = clearHistory[clearHistory.length - 1];
    const piece = piecesById.get(id);
    if (!piece) return;

    const next = present.map((r) => r.slice());
    for (const cell of piece.cells) next[cell.row][cell.col] = true;
    setPresent(next);
    setClearHistory((h) => h.slice(0, -1));
    setUndosUsed((u) => u + 1);
    setStreak(0);
    setClearedCount((n) => Math.max(0, n - 1));

    // Cancel any in-flight slide-out so the piece doesn't animate away while
    // it's being put back.
    const pendingExit = exitTimeoutsRef.current.get(id);
    if (pendingExit) {
      clearTimeout(pendingExit);
      exitTimeoutsRef.current.delete(id);
    }
    setExitingPieces((prev) => {
      if (!prev.has(id)) return prev;
      const nextMap = new Map(prev);
      nextMap.delete(id);
      return nextMap;
    });
    hapticHint();
    soundUndo();
  }, [present, piecesById, clearHistory, undosUsed, maxUndos]);

  return {
    present,
    queuedIds,
    exitingPieces,
    flashPieceId,
    hintPieceId,
    mistakes,
    hintsUsed,
    maxHints,
    undosUsed,
    maxUndos,
    canUndo: clearHistory.length > 0 && undosUsed < maxUndos,
    clearedCount,
    totalPieces,
    remainingPieces: totalPieces - clearedCount,
    livesLeft,
    outOfLives: livesLeft === 0,
    grantExtraLife,
    streak,
    bestStreak,
    tapCell,
    requestHint,
    undoLastClear,
  };
}
