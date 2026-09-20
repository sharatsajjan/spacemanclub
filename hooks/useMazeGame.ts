"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coord, Puzzle } from "@/lib/types";
import { isLineComplete, lineStepKind, sameCoord } from "@/lib/rules";
import { maxHintsForLevel } from "@/lib/difficultyWave";

interface UseMazeGameOptions {
  puzzle: Puzzle;
  onMistake: () => void;
  onAllComplete: () => void;
}

export function useMazeGame({ puzzle, onMistake, onAllComplete }: UseMazeGameOptions) {
  const [progress, setProgress] = useState<number[]>(() => puzzle.lines.map(() => 0));
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [flashLineId, setFlashLineId] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    setProgress(puzzle.lines.map(() => 0));
    setActiveLineId(null);
    setFlashLineId(null);
    setMistakes(0);
    setHintsUsed(0);
    finishedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  const maxHints = useMemo(() => maxHintsForLevel(puzzle.level), [puzzle.level]);
  const completedCount = useMemo(
    () => puzzle.lines.filter((l) => isLineComplete(l, progress[l.id])).length,
    [puzzle.lines, progress]
  );

  const triggerFlash = useCallback((lineId: number) => {
    setFlashLineId(lineId);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashLineId(null), 350);
  }, []);

  const startDrag = useCallback(
    (coord: Coord) => {
      if (finishedRef.current) return;
      const line = puzzle.lines.find((l) => {
        const p = progress[l.id];
        if (isLineComplete(l, p)) return false;
        return sameCoord(l.path[p], coord);
      });
      if (line) setActiveLineId(line.id);
    },
    [puzzle.lines, progress]
  );

  const enterCell = useCallback(
    (coord: Coord) => {
      if (activeLineId === null || finishedRef.current) return;
      const line = puzzle.lines[activeLineId];
      const p = progress[activeLineId];
      const kind = lineStepKind(line, p, coord);

      if (kind === "advance") {
        const nextProgress = p + 1;
        setProgress((prev) => {
          const copy = prev.slice();
          copy[activeLineId] = nextProgress;
          return copy;
        });
        if (isLineComplete(line, nextProgress)) {
          setActiveLineId(null);
          const allDone = puzzle.lines.every((l, idx) =>
            idx === activeLineId ? true : isLineComplete(l, progress[idx])
          );
          if (allDone) {
            finishedRef.current = true;
            onAllComplete();
          }
        }
      } else if (kind === "retreat") {
        setProgress((prev) => {
          const copy = prev.slice();
          copy[activeLineId] = Math.max(0, p - 1);
          return copy;
        });
      } else {
        setMistakes((m) => m + 1);
        triggerFlash(activeLineId);
        setProgress((prev) => {
          const copy = prev.slice();
          copy[activeLineId] = 0;
          return copy;
        });
        setActiveLineId(null);
        onMistake();
      }
    },
    [activeLineId, progress, puzzle.lines, onMistake, onAllComplete, triggerFlash]
  );

  const endDrag = useCallback(() => {
    setActiveLineId(null);
  }, []);

  const requestHint = useCallback(() => {
    if (finishedRef.current || hintsUsed >= maxHints) return;
    const targetId =
      activeLineId !== null && !isLineComplete(puzzle.lines[activeLineId], progress[activeLineId])
        ? activeLineId
        : puzzle.lines.find((l) => !isLineComplete(l, progress[l.id]))?.id;
    if (targetId === undefined) return;

    const line = puzzle.lines[targetId];
    const p = progress[targetId];
    const nextProgress = p + 1;
    setProgress((prev) => {
      const copy = prev.slice();
      copy[targetId] = nextProgress;
      return copy;
    });
    setHintsUsed((h) => h + 1);
    if (isLineComplete(line, nextProgress)) {
      const allDone = puzzle.lines.every((l, idx) => (idx === targetId ? true : isLineComplete(l, progress[idx])));
      if (allDone) {
        finishedRef.current = true;
        onAllComplete();
      }
    }
  }, [activeLineId, hintsUsed, maxHints, progress, puzzle.lines, onAllComplete]);

  return {
    progress,
    activeLineId,
    flashLineId,
    mistakes,
    hintsUsed,
    maxHints,
    completedCount,
    totalLines: puzzle.lines.length,
    startDrag,
    enterCell,
    endDrag,
    requestHint,
  };
}
