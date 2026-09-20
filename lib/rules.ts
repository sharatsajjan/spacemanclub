import { CellData, Coord, Direction, Puzzle } from "./types";

export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export function delta(dir: Direction): Coord {
  switch (dir) {
    case "up":
      return { row: -1, col: 0 };
    case "down":
      return { row: 1, col: 0 };
    case "left":
      return { row: 0, col: -1 };
    case "right":
      return { row: 0, col: 1 };
  }
}

export function directionBetween(a: Coord, b: Coord): Direction | null {
  if (b.row === a.row - 1 && b.col === a.col) return "up";
  if (b.row === a.row + 1 && b.col === a.col) return "down";
  if (b.row === a.row && b.col === a.col - 1) return "left";
  if (b.row === a.row && b.col === a.col + 1) return "right";
  return null;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function inBounds(size: number, c: Coord): boolean {
  return c.row >= 0 && c.row < size && c.col >= 0 && c.col < size;
}

export function cellAt(puzzle: Pick<Puzzle, "cells">, c: Coord): CellData {
  return puzzle.cells[c.row][c.col];
}

export function neighbors(size: number, c: Coord): Coord[] {
  return DIRECTIONS.map((d) => {
    const dd = delta(d);
    return { row: c.row + dd.row, col: c.col + dd.col };
  }).filter((n) => inBounds(size, n));
}

/**
 * Whether moving from `path` (the path so far, path[last] = current cell) to `next`
 * is a legal step under the game's rules:
 *  - next must be orthogonally adjacent to the current cell
 *  - next must not be blocked
 *  - next must not already be in the path (no revisits/crossing)
 *  - if the current cell has a forcedDir, the move MUST follow it
 */
export function isLegalStep(
  puzzle: Pick<Puzzle, "cells" | "size">,
  path: Coord[],
  next: Coord
): boolean {
  if (path.length === 0) return false;
  const current = path[path.length - 1];
  if (!inBounds(puzzle.size, next)) return false;
  const dir = directionBetween(current, next);
  if (!dir) return false;
  const nextCell = cellAt(puzzle, next);
  if (nextCell.type === "blocked") return false;
  if (path.some((p) => sameCoord(p, next))) return false;
  const currentCell = cellAt(puzzle, current);
  if (currentCell.forcedDir && currentCell.forcedDir !== dir) return false;
  return true;
}

export function legalNextCells(puzzle: Pick<Puzzle, "cells" | "size">, path: Coord[]): Coord[] {
  if (path.length === 0) return [];
  const current = path[path.length - 1];
  return neighbors(puzzle.size, current).filter((n) => isLegalStep(puzzle, path, n));
}

export function isPathComplete(puzzle: Pick<Puzzle, "end">, path: Coord[]): boolean {
  if (path.length === 0) return false;
  return sameCoord(path[path.length - 1], puzzle.end);
}
