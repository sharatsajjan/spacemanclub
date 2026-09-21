import { Direction, Puzzle } from "./types";
import { mulberry32, shuffle } from "./rng";
import { DIRECTIONS, pathClear, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

/**
 * Fills a cols x rows board so that every cell has an arrow piece and some
 * tap order clears the whole board.
 *
 * Two-phase construction, in the "clear" direction (unlike a drag-path
 * generator, a piece's direction only needs to be decided the moment we
 * commit to clearing it, so we can build the clear order forward):
 *
 *  1. Adaptive random phase: repeatedly pick a random still-present cell
 *     that currently has >=1 clear direction, assign it a random valid
 *     direction, and clear it. This is what gives boards real variety and
 *     genuine order-dependent puzzles (clearing one piece can block or
 *     unblock others).
 *  2. Guaranteed fallback: if the random walk ever paints itself into a
 *     corner (no present cell has a clear direction), finish whatever's
 *     left in ascending ring order, each pointed toward its nearest edge.
 *     This is always valid: the shortest path from any cell to its nearest
 *     edge only ever crosses strictly-smaller-ring cells, which are
 *     guaranteed already cleared by the time we get to it.
 *
 * This makes every generated board solvable by construction, with no
 * retries needed (verified up to 12x18 grids).
 */
function buildDirections(cols: number, rows: number, seed: number): Direction[][] {
  const rand = mulberry32(seed);
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const dirOf: (Direction | null)[][] = Array.from({ length: rows }, () => new Array(cols).fill(null));

  let remaining: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) remaining.push([r, c]);

  while (remaining.length > 0) {
    const candidates: { r: number; c: number; validDirs: Direction[] }[] = [];
    for (const [r, c] of remaining) {
      const validDirs = DIRECTIONS.filter((d) => pathClear(present, cols, rows, r, c, d));
      if (validDirs.length > 0) candidates.push({ r, c, validDirs });
    }
    if (candidates.length === 0) break;

    const pick = candidates[Math.floor(rand() * candidates.length)];
    const dir = pick.validDirs[Math.floor(rand() * pick.validDirs.length)];
    dirOf[pick.r][pick.c] = dir;
    present[pick.r][pick.c] = false;
    remaining = remaining.filter(([r, c]) => !(r === pick.r && c === pick.c));
  }

  if (remaining.length > 0) {
    remaining.sort((a, b) => ringOf(a[0], a[1], cols, rows) - ringOf(b[0], b[1], cols, rows));
    for (const [r, c] of remaining) {
      const distUp = r;
      const distDown = rows - 1 - r;
      const distLeft = c;
      const distRight = cols - 1 - c;
      const min = Math.min(distUp, distDown, distLeft, distRight);
      const tied: Direction[] = [];
      if (distUp === min) tied.push("up");
      if (distDown === min) tied.push("down");
      if (distLeft === min) tied.push("left");
      if (distRight === min) tied.push("right");
      dirOf[r][c] = tied[Math.floor(rand() * tied.length)];
      present[r][c] = false;
    }
  }

  return dirOf as Direction[][];
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const directions = buildDirections(cols, rows, seed);

  return {
    id: `level-${level}-${seed}`,
    level,
    cols,
    rows,
    directions,
    tier: tierForLevel(level),
    seed,
  };
}
