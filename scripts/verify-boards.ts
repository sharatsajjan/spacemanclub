/**
 * Generates a few thousand boards and checks the things that must never be
 * false of one. Run with: npx tsx scripts/verify-boards.ts
 *
 * This is the check to run after touching anything in lib/mazeGenerator.ts,
 * lib/shapes.ts or lib/difficultyWave.ts. It is fast (about a minute) and it
 * has caught every real generator bug this project has had: boards that
 * deadlock, holes inside a silhouette, pieces built outside one, and coils
 * whose own body blocks their exit.
 */
import { generatePuzzleForLevel } from "../lib/mazeGenerator";
import { pieceCanExit } from "../lib/rules";
import { layoutForLevel } from "../lib/shapes";

const LAST_LEVEL = Number(process.argv[2] ?? 160);
const SEEDS_PER_LEVEL = 3;

interface Tally {
  boards: number;
  pieces: number;
  unsolvable: number;
  gaps: number;
  outside: number;
  singles: number;
  nonAdjacent: number;
  cells: number;
  slowestMs: number;
}

const blank = (): Tally => ({
  boards: 0, pieces: 0, unsolvable: 0, gaps: 0, outside: 0,
  singles: 0, nonAdjacent: 0, cells: 0, slowestMs: 0,
});

const byShape: Record<string, Tally> = {};
const all = blank();
const lengths: number[] = [];

for (let level = 1; level <= LAST_LEVEL; level++) {
  for (let s = 1; s <= SEEDS_PER_LEVEL; s++) {
    const startedAt = Date.now();
    const puzzle = generatePuzzleForLevel(level, level * 7717 + s * 104729);
    const ms = Date.now() - startedAt;
    const shape = layoutForLevel(level).shape.id;
    byShape[shape] ??= blank();
    const tallies = [byShape[shape], all];
    for (const t of tallies) {
      t.boards++;
      t.slowestMs = Math.max(t.slowestMs, ms);
    }

    let maskCells = 0;
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) if (puzzle.mask[r][c]) maskCells++;
    }
    for (const t of tallies) t.cells += maskCells;

    const present = Array.from({ length: puzzle.rows }, () => new Array<boolean>(puzzle.cols).fill(false));
    let covered = 0;
    for (const piece of puzzle.pieces) {
      lengths.push(piece.cells.length);
      for (const t of tallies) {
        t.pieces++;
        if (piece.cells.length < 2) t.singles++;
      }
      for (let i = 1; i < piece.cells.length; i++) {
        const a = piece.cells[i - 1];
        const b = piece.cells[i];
        if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) {
          for (const t of tallies) t.nonAdjacent++;
        }
      }
      for (const cell of piece.cells) {
        // A piece must never claim a cell outside the silhouette.
        if (!puzzle.mask[cell.row][cell.col]) for (const t of tallies) t.outside++;
        if (!present[cell.row][cell.col]) covered++;
        present[cell.row][cell.col] = true;
      }
    }
    // Every cell inside the silhouette belongs to a piece: a hole there is
    // something the player can see and can never clear.
    for (const t of tallies) t.gaps += maskCells - covered;

    // Solvable, by the same greedy sweep the game's own rules allow: since
    // clearing a piece only ever frees cells, no order can be wrong, so
    // "keep taking whatever is legal" finishes any board that can finish.
    const remaining = new Set(puzzle.pieces.map((p) => p.id));
    let progress = true;
    while (remaining.size > 0 && progress) {
      progress = false;
      for (const id of [...remaining]) {
        const piece = puzzle.pieces[id];
        if (!pieceCanExit(present, piece.cells, puzzle.cols, puzzle.rows, piece.direction)) continue;
        for (const cell of piece.cells) present[cell.row][cell.col] = false;
        remaining.delete(id);
        progress = true;
      }
    }
    if (remaining.size > 0) for (const t of tallies) t.unsolvable++;
  }
}

lengths.sort((a, b) => a - b);
const row = (name: string, t: Tally) =>
  [
    name.padEnd(10),
    String(t.boards).padStart(6),
    (t.cells / t.boards).toFixed(0).padStart(11),
    (t.pieces / t.boards).toFixed(1).padStart(12),
    String(t.unsolvable).padStart(10),
    String(t.gaps).padStart(5),
    String(t.outside).padStart(8),
    String(t.nonAdjacent).padStart(12),
    String(t.singles).padStart(8),
    (t.slowestMs + "ms").padStart(8),
  ].join(" ");

console.log("shape      boards cells/board pieces/board unsolvable gaps  outside non-adjacent  singles  slowest");
for (const [shape, t] of Object.entries(byShape)) console.log(row(shape, t));
console.log(row("ALL", all));
console.log(
  `\npiece length: median ${lengths[Math.floor(lengths.length / 2)]}, ` +
    `mean ${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(2)}, ` +
    `longest ${lengths[lengths.length - 1]}`
);

const broken = all.unsolvable + all.gaps + all.outside + all.nonAdjacent;
if (broken > 0) {
  console.error(`\nFAILED: ${broken} boards are not playable.`);
  process.exit(1);
}
console.log("\nOK: every board is solvable, fully covered, and inside its silhouette.");
