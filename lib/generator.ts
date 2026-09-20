import { CellData, Coord, Direction, GameMode, Puzzle } from "./types";
import { mulberry32, randomInt, shuffle } from "./rng";
import { directionBetween, neighbors, sameCoord } from "./rules";
import { isSolvable } from "./solver";
import {
  blockedProbForDifficulty,
  coverageForDifficulty,
  forcedProbForDifficulty,
  sizeForDifficulty,
} from "./difficulty";

function key(c: Coord): string {
  return `${c.row}:${c.col}`;
}

/**
 * Builds a long self-avoiding path on the grid using randomized backtracking
 * DFS with a Warnsdorff-style heuristic (visit the most-constrained neighbor
 * first) so long, satisfying routes are found reliably even on larger grids.
 */
function generateLongPath(
  rand: () => number,
  size: number,
  minLen: number,
  targetLen: number,
  nodeBudget: number
): Coord[] | null {
  const visited = new Set<string>();
  const path: Coord[] = [];
  let nodes = 0;

  function unvisitedDegree(c: Coord): number {
    return neighbors(size, c).filter((n) => !visited.has(key(n))).length;
  }

  function dfs(c: Coord): boolean {
    nodes++;
    if (nodes > nodeBudget) return path.length >= minLen;

    path.push(c);
    visited.add(key(c));

    if (path.length >= targetLen) return true;

    let candidates = neighbors(size, c).filter((n) => !visited.has(key(n)));
    candidates = shuffle(rand, candidates);
    candidates.sort((a, b) => unvisitedDegree(a) - unvisitedDegree(b));

    for (const next of candidates) {
      if (dfs(next)) return true;
      if (nodes > nodeBudget) break;
    }

    if (path.length >= minLen) return true;

    path.pop();
    visited.delete(key(c));
    return false;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    path.length = 0;
    visited.clear();
    nodes = 0;
    const start: Coord = { row: randomInt(rand, 0, size - 1), col: randomInt(rand, 0, size - 1) };
    if (dfs(start) && path.length >= minLen) {
      return path.slice();
    }
  }
  return path.length >= minLen ? path.slice() : null;
}

function makeEmptyGrid(size: number): CellData[][] {
  const grid: CellData[][] = [];
  for (let r = 0; r < size; r++) {
    const row: CellData[] = [];
    for (let c = 0; c < size; c++) {
      row.push({ row: r, col: c, type: "empty" });
    }
    grid.push(row);
  }
  return grid;
}

export interface GenerateOptions {
  mode: GameMode;
  difficulty: number;
  seed: number;
}

export function generatePuzzle({ mode, difficulty, seed }: GenerateOptions): Puzzle {
  const rand = mulberry32(seed);
  const size = sizeForDifficulty(difficulty);
  const coverage = coverageForDifficulty(difficulty);
  const forcedProb = forcedProbForDifficulty(difficulty);
  const blockedProb = blockedProbForDifficulty(difficulty);

  const targetLen = Math.max(size + 2, Math.round(size * size * coverage));
  const minLen = Math.max(size + 1, Math.round(targetLen * 0.7));

  let path = generateLongPath(rand, size, minLen, targetLen, 60_000);
  if (!path || path.length < 2) {
    // Extremely unlikely fallback: a straight line across the top row.
    path = Array.from({ length: size }, (_, c) => ({ row: 0, col: c }));
  }

  const grid = makeEmptyGrid(size);
  const pathKeys = new Set(path.map(key));

  for (let i = 0; i < path.length - 1; i++) {
    const dir = directionBetween(path[i], path[i + 1]) as Direction;
    const isStart = i === 0;
    // Keep the very first move free on easy puzzles so players get a feel first.
    const skipStart = isStart && difficulty <= 1;
    if (!skipStart && rand() < forcedProb) {
      grid[path[i].row][path[i].col].forcedDir = dir;
    }
  }
  // Guarantee at least one arrow of flavor once the puzzle isn't trivial.
  if (difficulty >= 2 && path.length > 2) {
    const hasAny = path.some((p) => grid[p.row][p.col].forcedDir);
    if (!hasAny) {
      const idx = randomInt(rand, 0, path.length - 2);
      grid[path[idx].row][path[idx].col].forcedDir = directionBetween(path[idx], path[idx + 1]) as Direction;
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (pathKeys.has(key({ row: r, col: c }))) continue;
      if (rand() < blockedProb) {
        grid[r][c].type = "blocked";
      }
    }
  }

  const start = path[0];
  const end = path[path.length - 1];
  grid[start.row][start.col].type = "start";
  grid[end.row][end.col].type = "end";
  grid[end.row][end.col].forcedDir = undefined;

  const puzzle: Puzzle = {
    id: `${mode}-${difficulty}-${seed}`,
    mode,
    size,
    cells: grid,
    start,
    end,
    parPath: path,
    difficulty,
    seed,
  };

  if (!isSolvable(puzzle)) {
    // Safety net: strip obstacles/arrows if something about the layout broke solvability.
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!pathKeys.has(key({ row: r, col: c }))) grid[r][c].type = "empty";
      }
    }
  }

  return puzzle;
}

export function coordEquals(a: Coord, b: Coord): boolean {
  return sameCoord(a, b);
}
