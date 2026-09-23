import { Coord, Direction, Piece } from "./types";

/**
 * Timing for the threading slide-out, shared by the renderer (which plays it)
 * and the game hook (which keeps the piece mounted for its duration). Both
 * have to agree, so the numbers live here rather than being copied.
 */

/** Milliseconds per cell travelled. */
const MS_PER_CELL = 30;
/** A piece already at the edge still gets a beat; a piece crossing a tall
 * board doesn't get a crawl. */
const MIN_MS = 200;
const MAX_MS = 640;
/** One frame of slack so the piece isn't unmounted on the last frame of its
 * own animation, which would snap the tail away mid-motion. */
export const EXIT_UNMOUNT_GRACE_MS = 32;

/** How far the head is from the edge it leaves by, in cells. */
function edgeDistance(head: Coord, dir: Direction, cols: number, rows: number): number {
  switch (dir) {
    case "up":
      return head.row + 0.5;
    case "down":
      return rows - head.row - 0.5;
    case "left":
      return head.col + 0.5;
    case "right":
      return cols - head.col - 0.5;
  }
}

/** Distance from the head to just past the edge — the run-out the arrowhead
 * covers before the body starts disappearing. */
export function exitRunOut(piece: Piece, cols: number, rows: number): number {
  return edgeDistance(piece.cells[0], piece.direction, cols, rows) + 1;
}

/**
 * How long a piece takes to thread out. Scaled by the distance it actually
 * covers — head to the edge, plus its own length following behind — so every
 * piece leaves at the same speed. A fixed duration made a piece two cells
 * from the edge and one crossing the whole board travel at wildly different
 * rates, which is what read as jerky.
 */
export function exitDurationMs(piece: Piece, cols: number, rows: number): number {
  const travel = exitRunOut(piece, cols, rows) + piece.cells.length;
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, travel * MS_PER_CELL)));
}

/** Starts fast enough to feel like a direct response to the tap, then eases
 * off rather than ending at full tilt — a piece yanked away at peak speed and
 * cut off mid-stride is the other half of what looked unsmooth. */
export const EXIT_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
