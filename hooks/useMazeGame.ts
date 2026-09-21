"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coord, Puzzle } from "@/lib/types";
import { pathClear } from "@/lib/rules";
import { maxHintsForLevel } from "@/lib/difficultyWave";

interface UseMazeGameOptions {
  puzzle: Puzzle;
  onMistake: () => void;
  onAllComplete: () => void;
}

function makePresentGrid(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(true));
}

export function useMazeGame({ puzzle, onMistake, onAllComplete }: UseMazeGameOptions) {
  const [present, setPresent] = useState<boolean[][]>(() => makePresentGrid(puzzle.cols, puzzle.rows));
  const [flashCell, setFlashCell] = useState<Coord | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const maxHints = useMemo(() => maxHintsForLevel(puzzle.level), [puzzle.level]);
  const totalPieces = puzzle.cols * puzzle.rows;
  const clearedCount = useMemo(
    () => present.reduce((sum, row) => sum + row.filter((p) => !p).length, 0),
    [present]
  );

  useEffect(() => {
    setPresent(makePresentGrid(puzzle.cols, puzzle.rows));
    setFlashCell(null);
    setMistakes(0);
    setHintsUsed(0);
    finishedRef.current = false;
  }, [puzzle.id, puzzle.cols, puzzle.rows]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const triggerFlash = useCallback((coord: Coord) => {
    setFlashCell(coord);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashCell(null), 350);
  }, []);

  const tapCell = useCallback(
    (row: number, col: number) => {
      if (finishedRef.current) return;
      if (!present[row][col]) return; // already cleared, no-op

      const dir = puzzle.directions[row][col];
      const clear = pathClear(present, puzzle.cols, puzzle.rows, row, col, dir);

      if (clear) {
        const next = present.map((r) => r.slice());
        next[row][col] = false;
        setPresent(next);
        const remaining = next.reduce((sum, r) => sum + r.filter((p) => p).length, 0);
        if (remaining === 0) {
          finishedRef.current = true;
          onAllComplete();
        }
      } else {
        setMistakes((m) => m + 1);
        triggerFlash({ row, col });
        onMistake();
      }
    },
    [present, puzzle, onMistake, onAllComplete, triggerFlash]
  );

  const requestHint = useCallback(() => {
    if (finishedRef.current || hintsUsed >= maxHints) return;
    const clearable: Coord[] = [];
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        if (present[r][c] && pathClear(present, puzzle.cols, puzzle.rows, r, c, puzzle.directions[r][c])) {
          clearable.push({ row: r, col: c });
        }
      }
    }
    if (clearable.length === 0) return;
    const pick = clearable[Math.floor(Math.random() * clearable.length)];
    const next = present.map((r) => r.slice());
    next[pick.row][pick.col] = false;
    setPresent(next);
    setHintsUsed((h) => h + 1);
    const remaining = next.reduce((sum, r) => sum + r.filter((p) => p).length, 0);
    if (remaining === 0) {
      finishedRef.current = true;
      onAllComplete();
    }
  }, [present, puzzle, hintsUsed, maxHints, onAllComplete]);

  return {
    present,
    flashCell,
    mistakes,
    hintsUsed,
    maxHints,
    clearedCount,
    totalPieces,
    tapCell,
    requestHint,
  };
}
