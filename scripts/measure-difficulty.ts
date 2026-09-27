/**
 * Measures how hard the generated boards actually are to read, by tier.
 * Run with: npx tsx scripts/measure-difficulty.ts
 *
 * Difficulty here is not about wrong moves — there are none. Clearing a
 * piece only ever frees cells, so any legal tap is safe and no order can be
 * wrong. All of the difficulty is in FINDING a legal piece, so that is what
 * this measures:
 *
 *   glance moves   a legal piece whose arrowhead already sits within a
 *                  couple of cells of the edge. Visibly free: no lane to
 *                  trace, no board to read. While one is on offer, nothing
 *                  else about the board matters, so the share of moves
 *                  offering one is the single most useful number here.
 *   legal share    of the pieces still on the board, how many could be
 *                  tapped right now. Rises towards the end of every board
 *                  as the last few pieces come free, so read it as a
 *                  relative figure between runs, not an absolute.
 *   bends/piece    how crooked the lines are, which is what makes a lane
 *                  take work to follow.
 *
 * Numbers to compare against, as of the run that introduced this script
 * (share of moves offering a glance move): Easy 62%, Medium 42%, Hard 30%,
 * Hardest 28%. Before boards were scored on it, those were 79/67/54/52%.
 * One glance move at the start is unavoidable: the first piece to leave
 * needs a clear lane, and every cell inside the silhouette holds a piece.
 */
import { generatePuzzleForLevel } from "../lib/mazeGenerator";
import { pieceCanExit } from "../lib/rules";
import { tierForLevel } from "../lib/difficultyWave";
import { Coord, Direction, Piece, Puzzle } from "../lib/types";

const LAST_LEVEL = Number(process.argv[2] ?? 160);
const SEEDS_PER_LEVEL = 3;
/** Cells of lane a player takes in without tracing. Matches the generator. */
const GLANCE_DISTANCE = 2;

function distanceToEdge(head: Coord, dir: Direction, cols: number, rows: number): number {
  switch (dir) {
    case "up": return head.row;
    case "down": return rows - 1 - head.row;
    case "left": return head.col;
    case "right": return cols - 1 - head.col;
  }
}

function bendsOf(piece: Piece): number {
  let bends = 0;
  for (let i = 2; i < piece.cells.length; i++) {
    const a = piece.cells[i - 2];
    const b = piece.cells[i - 1];
    const c = piece.cells[i];
    if (a.row - b.row !== b.row - c.row || a.col - b.col !== b.col - c.col) bends++;
  }
  return bends;
}

/** Plays a board out, taking whatever is legal, and reports what it cost. */
function play(puzzle: Puzzle) {
  const present = Array.from({ length: puzzle.rows }, () => new Array<boolean>(puzzle.cols).fill(false));
  for (const piece of puzzle.pieces) for (const cell of piece.cells) present[cell.row][cell.col] = true;

  const remaining = new Set(puzzle.pieces.map((p) => p.id));
  let steps = 0;
  let glanceSteps = 0;
  let openingLegal = 0;
  let legalShareTotal = 0;
  while (remaining.size > 0) {
    const legal = [...remaining]
      .map((id) => puzzle.pieces[id])
      .filter((p) => pieceCanExit(present, p.cells, puzzle.cols, puzzle.rows, p.direction));
    if (legal.length === 0) return null; // deadlocked — verify-boards.ts will say so too
    if (steps === 0) openingLegal = legal.length;
    legalShareTotal += legal.length / remaining.size;
    if (legal.some((p) => distanceToEdge(p.cells[0], p.direction, puzzle.cols, puzzle.rows) <= GLANCE_DISTANCE)) {
      glanceSteps++;
    }
    steps++;
    const taken = legal[0];
    for (const cell of taken.cells) present[cell.row][cell.col] = false;
    remaining.delete(taken.id);
  }
  return {
    pieces: puzzle.pieces.length,
    openingLegal,
    legalShare: legalShareTotal / steps,
    glanceShare: glanceSteps / steps,
    bends: puzzle.pieces.reduce((n, p) => n + bendsOf(p), 0) / puzzle.pieces.length,
  };
}

const byTier: Record<string, { n: number; pieces: number; opening: number; legal: number; glance: number; bends: number }> = {};
for (let level = 5; level <= LAST_LEVEL; level++) {
  for (let s = 1; s <= SEEDS_PER_LEVEL; s++) {
    const measured = play(generatePuzzleForLevel(level, level * 7717 + s * 104729));
    if (!measured) throw new Error(`level ${level} seed ${s} cannot be finished`);
    const tier = tierForLevel(level);
    byTier[tier] ??= { n: 0, pieces: 0, opening: 0, legal: 0, glance: 0, bends: 0 };
    const t = byTier[tier];
    t.n++;
    t.pieces += measured.pieces;
    t.opening += measured.openingLegal;
    t.legal += measured.legalShare;
    t.glance += measured.glanceShare;
    t.bends += measured.bends;
  }
}

console.log("tier      boards  pieces  legal at start  legal share  moves needing no reading  bends/piece");
for (const tier of ["Easy", "Medium", "Hard", "Hardest"]) {
  const t = byTier[tier];
  if (!t) continue;
  console.log(
    tier.padEnd(9),
    String(t.n).padStart(6),
    (t.pieces / t.n).toFixed(1).padStart(7),
    (t.opening / t.n).toFixed(1).padStart(15),
    ((t.legal / t.n) * 100).toFixed(0).padStart(11) + "%",
    ((t.glance / t.n) * 100).toFixed(0).padStart(24) + "%",
    (t.bends / t.n).toFixed(2).padStart(12)
  );
}
