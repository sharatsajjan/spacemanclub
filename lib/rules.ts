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
 * Whether a piece can clear right now: sweeping every one of its own cells
 * in `dir` must reach the board edge without passing through a cell that
 * belongs to a DIFFERENT, still-present piece. A piece's own cells never
 * block its own sweep since the whole piece moves together as one rigid
 * body.
 */
export function pieceCanExit(
  present: boolean[][],
  pieceIdGrid: number[][],
  pieceId: number,
  cells: Coord[],
  cols: number,
  rows: number,
  dir: Direction
): boolean {
  const d = delta(dir);
  for (const cell of cells) {
    let r = cell.row + d.row;
    let c = cell.col + d.col;
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      if (present[r][c] && pieceIdGrid[r][c] !== pieceId) return false;
      r += d.row;
      c += d.col;
    }
  }
  return true;
}

/** The ring index of a cell: 0 = outer border, increasing toward the center. */
export function ringOf(row: number, col: number, cols: number, rows: number): number {
  return Math.min(row, rows - 1 - row, col, cols - 1 - col);
}
