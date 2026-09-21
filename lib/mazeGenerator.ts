import { Coord, Direction, Piece, Puzzle } from "./types";
import { mulberry32 } from "./rng";
import { DIRECTIONS, delta, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 1;
const MAX_PIECE_LEN = 5;

/**
 * Builds the whole board directly in clearing order — every piece is
 * created already knowing it can exit right now, so no separate
 * generate-then-solve pass is needed:
 *
 *  1. Pick a random still-present cell that has >=1 direction where
 *     sweeping just that cell reaches the board edge clear of every other
 *     present piece — this becomes a new piece's head, with that direction
 *     as its exit direction.
 *  2. Grow a tail from the head. The FIRST extension is mandatory: exactly
 *     the one cell directly behind the head, opposite the exit direction —
 *     this is what makes the arrow read as a continuation of the piece's
 *     own line (like the reference), not an arbitrary slide direction
 *     unrelated to its shape. Every extension after that first one can bend
 *     freely to any available neighbor, as long as the whole piece so far
 *     still clears in the exit direction. A piece that can't take that
 *     first mandatory step stays a single cell (still perfectly valid).
 *  3. Repeat until no present cell has any valid direction left.
 *  4. Guaranteed fallback: any leftover cells (not observed in testing up
 *     to 12x18 boards, but kept as a safety net) become single-cell pieces
 *     in ascending ring order, each pointed toward its nearest edge —
 *     always valid, since the shortest path from any cell to its nearest
 *     edge only crosses strictly-smaller-ring cells, already cleared by
 *     construction.
 */
function buildPieces(cols: number, rows: number, rand: () => number): Piece[] {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const pieces: Piece[] = [];

  while (true) {
    const candidates: { cell: Coord; dirs: Direction[] }[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!present[row][col]) continue;
        const dirs = DIRECTIONS.filter((dir) => pieceCanExit(present, pieceIdGrid, -2, [{ row, col }], cols, rows, dir));
        if (dirs.length > 0) candidates.push({ cell: { row, col }, dirs });
      }
    }
    if (candidates.length === 0) break;

    const pick = candidates[Math.floor(rand() * candidates.length)];
    const direction = pick.dirs[Math.floor(rand() * pick.dirs.length)];
    const id = pieces.length;
    const cells: Coord[] = [pick.cell];
    pieceIdGrid[pick.cell.row][pick.cell.col] = id;

    const targetLen = MIN_PIECE_LEN + Math.floor(rand() * (MAX_PIECE_LEN - MIN_PIECE_LEN + 1));
    let cur = pick.cell;
    let grewPastHead = false;

    if (targetLen >= 2) {
      const d = delta(direction);
      const mandatory: Coord = { row: pick.cell.row - d.row, col: pick.cell.col - d.col };
      if (
        mandatory.row >= 0 &&
        mandatory.row < rows &&
        mandatory.col >= 0 &&
        mandatory.col < cols &&
        present[mandatory.row][mandatory.col] &&
        pieceIdGrid[mandatory.row][mandatory.col] === -1
      ) {
        pieceIdGrid[mandatory.row][mandatory.col] = id;
        if (pieceCanExit(present, pieceIdGrid, id, [...cells, mandatory], cols, rows, direction)) {
          cells.push(mandatory);
          cur = mandatory;
          grewPastHead = true;
        } else {
          pieceIdGrid[mandatory.row][mandatory.col] = -1;
        }
      }
    }

    // Without that mandatory first segment, any further growth would place
    // an unconstrained direction right next to the head — exactly what this
    // whole construction exists to avoid. So only keep bending once past it.
    while (grewPastHead && cells.length < targetLen) {
      const options = DIRECTIONS.map((dir) => delta(dir))
        .map((d) => ({ row: cur.row + d.row, col: cur.col + d.col }))
        .filter((c) => c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols && present[c.row][c.col] && pieceIdGrid[c.row][c.col] === -1);
      const shuffledOptions = options
        .map((c) => ({ c, k: rand() }))
        .sort((a, b) => a.k - b.k)
        .map(({ c }) => c);

      let extended = false;
      for (const candidate of shuffledOptions) {
        pieceIdGrid[candidate.row][candidate.col] = id;
        if (pieceCanExit(present, pieceIdGrid, id, [...cells, candidate], cols, rows, direction)) {
          cells.push(candidate);
          cur = candidate;
          extended = true;
          break;
        } else {
          pieceIdGrid[candidate.row][candidate.col] = -1;
        }
      }
      if (!extended) break;
    }

    pieces.push({ id, cells, direction });
    for (const cell of cells) present[cell.row][cell.col] = false;
  }

  const leftover: Coord[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (present[row][col]) leftover.push({ row, col });
  if (leftover.length > 0) {
    leftover.sort((a, b) => ringOf(a.row, a.col, cols, rows) - ringOf(b.row, b.col, cols, rows));
    for (const cell of leftover) {
      const id = pieces.length;
      const distUp = cell.row;
      const distDown = rows - 1 - cell.row;
      const distLeft = cell.col;
      const distRight = cols - 1 - cell.col;
      const min = Math.min(distUp, distDown, distLeft, distRight);
      const tied: Direction[] = [];
      if (distUp === min) tied.push("up");
      if (distDown === min) tied.push("down");
      if (distLeft === min) tied.push("left");
      if (distRight === min) tied.push("right");
      pieces.push({ id, cells: [cell], direction: tied[Math.floor(rand() * tied.length)] });
      present[cell.row][cell.col] = false;
    }
  }

  return pieces;
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const rand = mulberry32(seed);
  const pieces = buildPieces(cols, rows, rand);

  return {
    id: `level-${level}-${seed}`,
    level,
    cols,
    rows,
    pieces,
    tier: tierForLevel(level),
    seed,
  };
}
