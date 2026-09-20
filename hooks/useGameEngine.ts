"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coord, GameMode, Puzzle, PuzzleResult } from "@/lib/types";
import { isLegalStep, isPathComplete, sameCoord } from "@/lib/rules";
import { findContinuation } from "@/lib/solver";
import { computeScore } from "@/lib/scoring";
import { maxHintsForDifficulty } from "@/lib/difficulty";

interface UseGameEngineOptions {
  puzzle: Puzzle;
  mode: GameMode;
  onComplete?: (result: PuzzleResult) => void;
}

export function useGameEngine({ puzzle, mode, onComplete }: UseGameEngineOptions) {
  const [path, setPath] = useState<Coord[]>([puzzle.start]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintCell, setHintCell] = useState<Coord | null>(null);
  const [stuckFlash, setStuckFlash] = useState(false);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startRef = useRef(Date.now());
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completed = result !== null;

  useEffect(() => {
    setPath([puzzle.start]);
    setHintsUsed(0);
    setHintCell(null);
    setResult(null);
    startRef.current = Date.now();
    setNow(Date.now());
  }, [puzzle]);

  useEffect(() => {
    if (completed) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [completed]);

  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  const elapsedMs = completed ? result!.elapsedMs : now - startRef.current;

  const maxHints = useMemo(() => maxHintsForDifficulty(puzzle.difficulty), [puzzle.difficulty]);

  const finish = useCallback(
    (finalPath: Coord[]) => {
      const elapsed = Date.now() - startRef.current;
      const parMoves = puzzle.parPath.length - 1;
      const playerMoves = finalPath.length - 1;
      const { score, stars, xpGained } = computeScore({
        mode,
        difficulty: puzzle.difficulty,
        size: puzzle.size,
        parMoves,
        playerMoves,
        elapsedMs: elapsed,
        hintsUsed,
      });
      const finalResult: PuzzleResult = {
        puzzleId: puzzle.id,
        mode,
        completed: true,
        path: finalPath,
        parMoves,
        playerMoves,
        elapsedMs: elapsed,
        hintsUsed,
        stars,
        score,
        xpGained,
      };
      setResult(finalResult);
      onComplete?.(finalResult);
    },
    [puzzle, mode, hintsUsed, onComplete]
  );

  const selectCell = useCallback(
    (coord: Coord) => {
      if (completed) return;
      setHintCell(null);
      const idx = path.findIndex((p) => sameCoord(p, coord));
      if (idx >= 0) {
        if (idx < path.length - 1) setPath(path.slice(0, idx + 1));
        return;
      }
      if (!isLegalStep(puzzle, path, coord)) return;
      const nextPath = [...path, coord];
      setPath(nextPath);
      if (isPathComplete(puzzle, nextPath)) {
        finish(nextPath);
      }
    },
    [completed, path, puzzle, finish]
  );

  const undo = useCallback(() => {
    if (completed || path.length <= 1) return;
    setHintCell(null);
    setPath(path.slice(0, -1));
  }, [completed, path]);

  const requestHint = useCallback(() => {
    if (completed || hintsUsed >= maxHints) return;
    const continuation = findContinuation(puzzle, path);
    if (continuation && continuation.length > path.length) {
      const next = continuation[path.length];
      setHintCell(next);
      setHintsUsed((h) => h + 1);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => setHintCell(null), 2200);
    } else {
      setStuckFlash(true);
      setTimeout(() => setStuckFlash(false), 900);
    }
  }, [completed, hintsUsed, maxHints, puzzle, path]);

  const reset = useCallback(() => {
    setPath([puzzle.start]);
    setHintsUsed(0);
    setHintCell(null);
    setResult(null);
    startRef.current = Date.now();
  }, [puzzle]);

  return {
    path,
    elapsedMs,
    hintsUsed,
    hintCell,
    maxHints,
    stuckFlash,
    completed,
    result,
    selectCell,
    undo,
    requestHint,
    reset,
    canUndo: path.length > 1 && !completed,
    parMoves: puzzle.parPath.length - 1,
    playerMoves: path.length - 1,
  };
}
