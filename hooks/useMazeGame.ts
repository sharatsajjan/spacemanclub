"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puzzle } from "@/lib/types";
import { pieceCanExit } from "@/lib/rules";
import { maxHintsForLevel } from "@/lib/difficultyWave";

interface UseMazeGameOptions {
  puzzle: Puzzle;
  onMistake: () => void;
  onAllComplete: () => void;
}

function makePresentGrid(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(true));
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

  const [present, setPresent] = useState<boolean[][]>(() => makePresentGrid(puzzle.cols, puzzle.rows));
  const [clearedCount, setClearedCount] = useState(0);
  const [flashPieceId, setFlashPieceId] = useState<number | null>(null);
  const [hintPieceId, setHintPieceId] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const maxHints = useMemo(() => maxHintsForLevel(puzzle.level), [puzzle.level]);
  const totalPieces = puzzle.pieces.length;

  useEffect(() => {
    setPresent(makePresentGrid(puzzle.cols, puzzle.rows));
    setClearedCount(0);
    setFlashPieceId(null);
    setHintPieceId(null);
    setMistakes(0);
    setHintsUsed(0);
    finishedRef.current = false;
  }, [puzzle.id, puzzle.cols, puzzle.rows]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const triggerFlash = useCallback((pieceId: number) => {
    setFlashPieceId(pieceId);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashPieceId(null), 350);
  }, []);

  const clearPiece = useCallback(
    (id: number) => {
      const piece = piecesById.get(id);
      if (!piece) return;
      const next = present.map((r) => r.slice());
      for (const cell of piece.cells) next[cell.row][cell.col] = false;
      setPresent(next);
      setHintPieceId((h) => (h === id ? null : h));
      setClearedCount((n) => {
        const nextCount = n + 1;
        if (nextCount === totalPieces) {
          finishedRef.current = true;
          onAllComplete();
        }
        return nextCount;
      });
    },
    [present, piecesById, totalPieces, onAllComplete]
  );

  const tapCell = useCallback(
    (row: number, col: number) => {
      if (finishedRef.current) return;
      const id = pieceIdGrid[row][col];
      if (id === -1 || !present[row][col]) return; // already cleared, no-op

      const piece = piecesById.get(id)!;
      const canExit = pieceCanExit(present, pieceIdGrid, id, piece.cells, puzzle.cols, puzzle.rows, piece.direction);

      if (canExit) {
        clearPiece(id);
      } else {
        setMistakes((m) => m + 1);
        triggerFlash(id);
        onMistake();
      }
    },
    [present, pieceIdGrid, piecesById, puzzle.cols, puzzle.rows, clearPiece, onMistake, triggerFlash]
  );

  const requestHint = useCallback(() => {
    if (finishedRef.current || hintsUsed >= maxHints) return;
    const clearable = puzzle.pieces.filter(
      (piece) =>
        present[piece.cells[0].row][piece.cells[0].col] &&
        pieceCanExit(present, pieceIdGrid, piece.id, piece.cells, puzzle.cols, puzzle.rows, piece.direction)
    );
    if (clearable.length === 0) return;
    const pick = clearable[Math.floor(Math.random() * clearable.length)];
    setHintsUsed((h) => h + 1);
    setHintPieceId(pick.id);
  }, [present, pieceIdGrid, puzzle.pieces, puzzle.cols, puzzle.rows, hintsUsed, maxHints]);

  return {
    present,
    flashPieceId,
    hintPieceId,
    mistakes,
    hintsUsed,
    maxHints,
    clearedCount,
    totalPieces,
    tapCell,
    requestHint,
  };
}
