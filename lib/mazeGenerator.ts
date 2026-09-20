import { Coord, MazeLine, Puzzle } from "./types";
import { mulberry32, shuffle } from "./rng";
import { neighbors } from "./rules";
import { gridForLevel, linesForLevel, tierForLevel } from "./difficultyWave";

function key(c: Coord): string {
  return `${c.row}:${c.col}`;
}

/**
 * Builds a Hamiltonian path (visits every cell exactly once) on a cols x rows
 * grid using randomized backtracking DFS with a Warnsdorff-style heuristic
 * (visit the most-constrained neighbor first), which finds full-coverage
 * routes reliably even on fairly large grids. Falls back to a simple
 * boustrophedon (snake) sweep in the extremely unlikely case the search
 * budget is exhausted, which always covers every cell too.
 */
function generateFullCoveragePath(cols: number, rows: number, seed: number, nodeBudget = 600_000): Coord[] {
  const rand = mulberry32(seed);
  const target = cols * rows;
  const visited = new Set<string>();
  const path: Coord[] = [];
  let nodes = 0;

  function unvisitedDegree(c: Coord): number {
    return neighbors(cols, rows, c).filter((n) => !visited.has(key(n))).length;
  }

  function dfs(c: Coord): boolean {
    nodes++;
    if (nodes > nodeBudget) return false;
    path.push(c);
    visited.add(key(c));
    if (path.length >= target) return true;

    let candidates = neighbors(cols, rows, c).filter((n) => !visited.has(key(n)));
    candidates = shuffle(rand, candidates);
    candidates.sort((a, b) => unvisitedDegree(a) - unvisitedDegree(b));

    for (const next of candidates) {
      if (dfs(next)) return true;
      if (nodes > nodeBudget) break;
    }
    path.pop();
    visited.delete(key(c));
    return false;
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    path.length = 0;
    visited.clear();
    nodes = 0;
    const start: Coord = { row: Math.floor(rand() * rows), col: Math.floor(rand() * cols) };
    if (dfs(start) && path.length === target) return path.slice();
  }

  const fallback: Coord[] = [];
  for (let r = 0; r < rows; r++) {
    const cs = r % 2 === 0 ? Array.from({ length: cols }, (_, i) => i) : Array.from({ length: cols }, (_, i) => cols - 1 - i);
    for (const c of cs) fallback.push({ row: r, col: c });
  }
  return fallback;
}

/** Cuts one Hamiltonian path into several disjoint sub-paths — a valid full-coverage path partition. */
function cutIntoLines(fullPath: Coord[], numLines: number, seed: number): Coord[][] {
  const rand = mulberry32(seed);
  const minSeg = 4;
  const total = fullPath.length;
  const avail = Math.max(0, total - numLines * minSeg);
  let remaining = numLines;
  let pos = 0;
  const cuts: number[] = [];
  for (let i = 0; i < numLines - 1; i++) {
    const maxExtra = Math.max(0, Math.floor((avail * (0.5 + rand() * 1.0)) / remaining));
    const len = minSeg + Math.min(maxExtra, total - pos - minSeg * remaining);
    pos += len;
    cuts.push(pos);
    remaining--;
  }
  const segments: Coord[][] = [];
  let s = 0;
  for (const cut of cuts) {
    segments.push(fullPath.slice(s, cut));
    s = cut;
  }
  segments.push(fullPath.slice(s));
  return segments;
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const numLines = Math.min(linesForLevel(level), Math.floor((cols * rows) / 4));

  const fullPath = generateFullCoveragePath(cols, rows, seed);
  const segments = cutIntoLines(fullPath, Math.max(1, numLines), seed + 99991);

  const lines: MazeLine[] = segments.map((path, id) => ({ id, path }));

  return {
    id: `level-${level}-${seed}`,
    level,
    cols,
    rows,
    lines,
    tier: tierForLevel(level),
    seed,
  };
}
