import { Coord, Direction } from "./types";

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

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function inBounds(cols: number, rows: number, c: Coord): boolean {
  return c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;
}

/**
 * Whether the piece at (row, col) can clear right now: walking from it in
 * `dir` must reach the board edge without passing through any other cell
 * that's still marked `present` (not yet cleared).
 */
export function pathClear(
  present: boolean[][],
  cols: number,
  rows: number,
  row: number,
  col: number,
  dir: Direction
): boolean {
  const d = delta(dir);
  let r = row + d.row;
  let c = col + d.col;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    if (present[r][c]) return false;
    r += d.row;
    c += d.col;
  }
  return true;
}

/** The ring index of a cell: 0 = outer border, increasing toward the center. */
export function ringOf(row: number, col: number, cols: number, rows: number): number {
  return Math.min(row, rows - 1 - row, col, cols - 1 - col);
}
