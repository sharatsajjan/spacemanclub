import { Coord, Direction, MazeLine } from "./types";

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

export function inBounds(cols: number, rows: number, c: Coord): boolean {
  return c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;
}

export function neighbors(cols: number, rows: number, c: Coord): Coord[] {
  return DIRECTIONS.map((d) => {
    const dd = delta(d);
    return { row: c.row + dd.row, col: c.col + dd.col };
  }).filter((n) => inBounds(cols, rows, n));
}

/**
 * A line's path is fixed by the puzzle (no branching choice) — legality of a
 * drag step is just "does the next cell match the next/previous step in this
 * exact line's path". `progress` is the index into `line.path` the player
 * has currently traced up to (0 = only the start dot is placed).
 */
export function lineStepKind(
  line: MazeLine,
  progress: number,
  candidate: Coord
): "advance" | "retreat" | "wrong" {
  const next = line.path[progress + 1];
  if (next && sameCoord(next, candidate)) return "advance";
  const prev = line.path[progress - 1];
  if (prev && sameCoord(prev, candidate)) return "retreat";
  return "wrong";
}

export function isLineComplete(line: MazeLine, progress: number): boolean {
  return progress >= line.path.length - 1;
}
