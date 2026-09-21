import { Coord, Direction, Piece, Puzzle } from "./types";
import { mulberry32, shuffle } from "./rng";
import { DIRECTIONS, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 1;
const MAX_PIECE_LEN = 5;
const CELL_DELTAS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

interface RawPiece {
  cells: Coord[];
}

/**
 * Tiles the whole board into small connected, bent paths (1-5 cells each) —
 * every cell belongs to exactly one piece, no gaps, no overlaps. Visits
 * cells in random order; each uncovered cell seeds a piece that random-walks
 * to adjacent uncovered cells until it hits its target length or a dead end.
 */
function buildTiling(cols: number, rows: number, rand: () => number): { pieceIdGrid: number[][]; pieces: RawPiece[] } {
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const allCells: Coord[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) allCells.push({ row: r, col: c });
  const order = shuffle(rand, allCells);

  const pieces: RawPiece[] = [];
  for (const start of order) {
    if (pieceIdGrid[start.row][start.col] !== -1) continue;
    const targetLen = MIN_PIECE_LEN + Math.floor(rand() * (MAX_PIECE_LEN - MIN_PIECE_LEN + 1));
    const cells: Coord[] = [start];
    const id = pieces.length;
    pieceIdGrid[start.row][start.col] = id;
    let cur = start;
    while (cells.length < targetLen) {
      const options = CELL_DELTAS.map(([dr, dc]) => ({ row: cur.row + dr, col: cur.col + dc })).filter(
        (p) => p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols && pieceIdGrid[p.row][p.col] === -1
      );
      if (options.length === 0) break;
      const next = options[Math.floor(rand() * options.length)];
      pieceIdGrid[next.row][next.col] = id;
      cells.push(next);
      cur = next;
    }
    pieces.push({ cells });
  }

  return { pieceIdGrid, pieces };
}

/**
 * Assigns each piece a slide-out direction and produces a valid clearing
 * order, in two phases:
 *
 *  1. Adaptive random: repeatedly pick a random still-present piece that has
 *     >=1 direction where sweeping every one of its cells reaches the board
 *     edge clear of every OTHER present piece, and clear it. This is what
 *     gives boards real variety and order-dependent puzzles.
 *  2. Guaranteed fallback: if the random walk ever gets stuck (some pieces
 *     left with no clear direction), decompose just those into single-cell
 *     pieces and finish them in ascending ring order, each pointed toward
 *     its nearest edge — always valid, since the shortest path from any
 *     cell to its nearest edge only crosses strictly-smaller-ring cells,
 *     which are guaranteed already cleared by then. (Not observed to
 *     trigger in testing up to 12x18 boards, but kept as a safety net.)
 */
function assignDirectionsAndOrder(
  cols: number,
  rows: number,
  pieceIdGrid: number[][],
  rawPieces: RawPiece[],
  rand: () => number
): Piece[] {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieces: Piece[] = rawPieces.map((p, id) => ({ id, cells: p.cells, direction: "up" }));
  let remaining = pieces.map((p) => p.id);

  while (remaining.length > 0) {
    const candidates: { id: number; dirs: Direction[] }[] = [];
    for (const id of remaining) {
      const dirs = DIRECTIONS.filter((dir) => pieceCanExit(present, pieceIdGrid, id, pieces[id].cells, cols, rows, dir));
      if (dirs.length > 0) candidates.push({ id, dirs });
    }
    if (candidates.length === 0) break;

    const pick = candidates[Math.floor(rand() * candidates.length)];
    const dir = pick.dirs[Math.floor(rand() * pick.dirs.length)];
    pieces[pick.id].direction = dir;
    for (const cell of pieces[pick.id].cells) present[cell.row][cell.col] = false;
    remaining = remaining.filter((id) => id !== pick.id);
  }

  if (remaining.length > 0) {
    let singleCells: Coord[] = [];
    for (const id of remaining) singleCells.push(...pieces[id].cells);
    singleCells = singleCells.sort((a, b) => ringOf(a.row, a.col, cols, rows) - ringOf(b.row, b.col, cols, rows));

    for (const id of remaining) pieces[id].cells = [];

    for (const cell of singleCells) {
      const newId = pieces.length;
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
      pieces.push({ id: newId, cells: [cell], direction: tied[Math.floor(rand() * tied.length)] });
      pieceIdGrid[cell.row][cell.col] = newId;
      present[cell.row][cell.col] = false;
    }
  }

  return pieces.filter((p) => p.cells.length > 0);
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const rand = mulberry32(seed);
  const { pieceIdGrid, pieces: rawPieces } = buildTiling(cols, rows, rand);
  const pieces = assignDirectionsAndOrder(cols, rows, pieceIdGrid, rawPieces, rand);

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
