import { Coord, Puzzle } from "./types";
import { legalNextCells, sameCoord } from "./rules";

interface SolveOptions {
  /** Stop after finding this many distinct solutions (perf guard). */
  maxSolutions?: number;
  /** Stop after visiting this many search nodes (perf guard for large grids). */
  maxNodes?: number;
}

/**
 * Counts solutions reachable by continuing from `partialPath` (partialPath must
 * be a legal path already, path[0] = puzzle.start). Used both to confirm a
 * generated puzzle is solvable and to check whether a player's current
 * position still has a way to win (for hints).
 */
export function countSolutionsFrom(
  puzzle: Pick<Puzzle, "cells" | "size" | "end">,
  partialPath: Coord[],
  options: SolveOptions = {}
): { count: number; firstSolution: Coord[] | null } {
  const maxSolutions = options.maxSolutions ?? 2;
  const maxNodes = options.maxNodes ?? 200_000;
  let nodes = 0;
  let count = 0;
  let firstSolution: Coord[] | null = null;

  function dfs(path: Coord[]): boolean {
    nodes++;
    if (nodes > maxNodes) return count >= maxSolutions;
    const last = path[path.length - 1];
    if (sameCoord(last, puzzle.end)) {
      count++;
      if (!firstSolution) firstSolution = path.slice();
      return count >= maxSolutions;
    }
    const options = legalNextCells(puzzle, path);
    for (const next of options) {
      path.push(next);
      const stop = dfs(path);
      path.pop();
      if (stop) return true;
    }
    return false;
  }

  dfs(partialPath.slice());
  return { count, firstSolution };
}

/** Finds a single valid continuation to the end from the given path, or null if stuck. */
export function findContinuation(
  puzzle: Pick<Puzzle, "cells" | "size" | "end">,
  partialPath: Coord[]
): Coord[] | null {
  const { firstSolution } = countSolutionsFrom(puzzle, partialPath, { maxSolutions: 1 });
  return firstSolution;
}

export function isSolvable(puzzle: Pick<Puzzle, "cells" | "size" | "end" | "start">): boolean {
  const { count } = countSolutionsFrom(puzzle, [puzzle.start], { maxSolutions: 1 });
  return count >= 1;
}
