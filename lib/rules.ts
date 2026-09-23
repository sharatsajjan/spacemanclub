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
 * Whether a piece can clear right now. A piece leaves by threading along
 * its own line, head first: the head travels straight out in `dir` and each
 * segment behind it follows into the cell the one ahead just vacated. So
 * the only ground the piece covers that it doesn't already occupy is the
 * straight lane from its head to the board edge — that lane is what has to
 * be free of other still-present pieces, however many times the body bends.
 *
 * `cells[0]` is the head. Every piece is built that way (see
 * mazeGenerator), and the arrowhead is drawn there, so the end the player
 * sees pointing the way out is the same end this checks from.
 *
 * The piece's OWN body blocks that lane too. A coil whose head points back
 * through its own loop can't thread out: the body follows the head rather
 * than moving aside, so the cell ahead is still occupied when the head
 * reaches it. (Under the old rigid rule the whole shape moved at once and
 * its own cells couldn't get in the way, which is why they were exempt.)
 * Anything this rejects on its own body is rejected forever, so the
 * generator has to avoid building one — it runs this same check, and
 * verifySolvable is the backstop.
 */
export function pieceCanExit(
  present: boolean[][],
  cells: Coord[],
  cols: number,
  rows: number,
  dir: Direction
): boolean {
  const head = cells[0];
  if (!head) return true;
  const d = delta(dir);
  let r = head.row + d.row;
  let c = head.col + d.col;
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
