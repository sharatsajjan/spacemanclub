import { Coord, Direction, Piece, Puzzle } from "./types";
import { mulberry32 } from "./rng";
import { DIRECTIONS, delta, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 2;
const MAX_PIECE_LEN = 5;
const MAX_GENERATION_ATTEMPTS = 20;

interface Candidate {
  cell: Coord;
  dirs: Direction[];
  /** Dirs where a 2-cell piece (this cell + the one directly behind it) still clears. */
  growDirs: Direction[];
}

function sameCell(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Present-state as of a piece's own position in `pieces` (its id) — everything
 * committed before it cleared, everything from it onward still on the board.
 * This is what "as of this piece's actual turn" means, independent of when
 * it happened to be extended during generation. */
function presentAsOfPieceId(pieces: Piece[], pieceId: number, cols: number, rows: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  for (let i = 0; i < pieceId; i++) {
    for (const cell of pieces[i].cells) grid[cell.row][cell.col] = false;
  }
  return grid;
}

/**
 * A cell fully boxed in by already-placed pieces (no free neighbor at all)
 * can only ever be rescued by joining one of those neighboring pieces. Its
 * validity is re-checked using the present-state AS OF THE NEIGHBOR PIECE'S
 * OWN EXISTING POSITION in `pieces` (not "right now") — so that piece's turn
 * never needs to move, which is what keeps this safe: no other piece's
 * already-verified validity (which may have counted on this piece's timing)
 * is disturbed.
 */
function tryMergeIntoNeighborTail(
  cell: Coord,
  present: boolean[][],
  pieceIdGrid: number[][],
  pieces: Piece[],
  cols: number,
  rows: number
): boolean {
  for (const dir of DIRECTIONS) {
    const d = delta(dir);
    const n: Coord = { row: cell.row + d.row, col: cell.col + d.col };
    if (n.row < 0 || n.row >= rows || n.col < 0 || n.col >= cols) continue;
    const pid = pieceIdGrid[n.row][n.col];
    if (pid < 0 || present[n.row][n.col]) continue; // must belong to an already-committed piece
    const piece = pieces[pid];
    const tail = piece.cells[piece.cells.length - 1];
    if (!sameCell(tail, n)) continue; // only extend from the true tail end

    const asOf = presentAsOfPieceId(pieces, pid, cols, rows);
    pieceIdGrid[cell.row][cell.col] = pid;
    if (pieceCanExit(asOf, pieceIdGrid, pid, [...piece.cells, cell], cols, rows, piece.direction)) {
      piece.cells.push(cell);
      present[cell.row][cell.col] = false;
      return true;
    }
    pieceIdGrid[cell.row][cell.col] = -1;
  }
  return false;
}

/** Randomized DFS: grow a simple path from `start` through present, unclaimed
 * cells, up to maxLen cells, for `tryRescue` to test as a candidate piece. */
function growScratchPath(
  start: Coord,
  present: boolean[][],
  pieceIdGrid: number[][],
  maxLen: number,
  rand: () => number,
  tempId: number,
  cols: number,
  rows: number
): Coord[] {
  const path: Coord[] = [start];
  pieceIdGrid[start.row][start.col] = tempId;
  let cur = start;
  while (path.length < maxLen) {
    const options = DIRECTIONS.map((dir) => delta(dir))
      .map((d) => ({ row: cur.row + d.row, col: cur.col + d.col }))
      .filter((c) => c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols && present[c.row][c.col] && pieceIdGrid[c.row][c.col] === -1);
    if (options.length === 0) break;
    const next = options[Math.floor(rand() * options.length)];
    pieceIdGrid[next.row][next.col] = tempId;
    path.push(next);
    cur = next;
  }
  for (const c of path) pieceIdGrid[c.row][c.col] = -1;
  return path;
}

/** Try to rescue a stuck cell by forming it (plus some adjacent present,
 * unclaimed cells) into one brand-new piece — safe the same way simple
 * pairing is, since it's a piece created fresh right now, not retroactively
 * extending an earlier one. Rarely needed once `tryMergeIntoNeighborTail`
 * runs first, but covers a stuck cell that still has >=1 free neighbor. */
function tryRescue(
  start: Coord,
  present: boolean[][],
  pieceIdGrid: number[][],
  pieces: Piece[],
  rand: () => number,
  cols: number,
  rows: number
): boolean {
  const tempId = -3;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let maxLen = MAX_PIECE_LEN; maxLen >= 2; maxLen--) {
      const path = growScratchPath(start, present, pieceIdGrid, maxLen, rand, tempId, cols, rows);
      if (path.length < 2) continue;
      for (const cells of [path, path.slice().reverse()]) {
        for (const c of cells) pieceIdGrid[c.row][c.col] = tempId;
        const dir = DIRECTIONS.find((d) => {
          const delt = delta(d);
          return cells[0].row - cells[1].row === delt.row && cells[0].col - cells[1].col === delt.col;
        })!;
        const ok = pieceCanExit(present, pieceIdGrid, tempId, cells, cols, rows, dir);
        for (const c of cells) pieceIdGrid[c.row][c.col] = -1;
        if (ok) {
          const id = pieces.length;
          for (const c of cells) pieceIdGrid[c.row][c.col] = id;
          pieces.push({ id, cells, direction: dir });
          for (const c of cells) present[c.row][c.col] = false;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Builds the whole board directly in clearing order — every piece is
 * created already knowing it can exit right now, so no separate
 * generate-then-solve pass is needed:
 *
 *  1. Find every still-present cell with >=1 direction where sweeping just
 *     that cell reaches the board edge clear of every other present piece —
 *     each is a candidate new piece head. For each, also check which of
 *     those directions would STILL clear if extended to include the one
 *     cell directly behind it (its mandatory first tail segment).
 *  2. Strongly prefer a candidate that CAN grow past 1 cell — a piece is
 *     only left as a single cell as an absolute last resort. This is what
 *     keeps the board reading as connected multi-segment lines rather than
 *     a grid of individual tiles.
 *  3. Grow the tail past that mandatory first segment by bending freely to
 *     any available neighbor, as long as the whole piece so far still
 *     clears in the exit direction — this first segment is what makes the
 *     arrow read as a genuine continuation of the piece's own line, not an
 *     arbitrary slide direction unrelated to its shape.
 *  4. Once nothing present can grow into a fresh piece, every stuck cell
 *     (almost always one fully boxed in by already-placed pieces, with no
 *     free neighbor left to pair with) is rescued rather than becoming a
 *     lone 1-cell piece: first by joining an adjacent already-placed
 *     piece's tail (`tryMergeIntoNeighborTail`), or failing that, by
 *     forming a fresh small piece with whatever adjacent cells are still
 *     free (`tryRescue`).
 *  5. Absolute last-resort fallback: any cell neither could rescue becomes
 *     a single-cell piece in ascending ring order, pointed toward its
 *     nearest edge — always valid, since the shortest path from any cell to
 *     its nearest edge only crosses strictly-smaller-ring cells, already
 *     cleared by construction. `generatePuzzleForLevel` retries the whole
 *     build from scratch first, since in testing this is reached well under
 *     1% of the time and essentially never survives even a couple of
 *     retries.
 */
function buildPieces(cols: number, rows: number, rand: () => number): Piece[] {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const pieces: Piece[] = [];

  while (true) {
    const growable: Candidate[] = [];
    const singletonOnly: Candidate[] = [];
    const tempId = -2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!present[row][col]) continue;
        const dirs = DIRECTIONS.filter((dir) => pieceCanExit(present, pieceIdGrid, tempId, [{ row, col }], cols, rows, dir));
        if (dirs.length === 0) continue;

        const growDirs: Direction[] = [];
        pieceIdGrid[row][col] = tempId; // so the mandatory cell's own sweep doesn't treat the head as foreign
        for (const dir of dirs) {
          const d = delta(dir);
          const m: Coord = { row: row - d.row, col: col - d.col };
          if (m.row < 0 || m.row >= rows || m.col < 0 || m.col >= cols || !present[m.row][m.col] || pieceIdGrid[m.row][m.col] !== -1) continue;
          pieceIdGrid[m.row][m.col] = tempId;
          if (pieceCanExit(present, pieceIdGrid, tempId, [{ row, col }, m], cols, rows, dir)) growDirs.push(dir);
          pieceIdGrid[m.row][m.col] = -1;
        }
        pieceIdGrid[row][col] = -1;

        const candidate: Candidate = { cell: { row, col }, dirs, growDirs };
        (growDirs.length > 0 ? growable : singletonOnly).push(candidate);
      }
    }
    if (growable.length === 0 && singletonOnly.length === 0) break;

    if (growable.length === 0) {
      let resolvedAny = false;
      const stillStuck: Coord[] = [];
      for (const cand of singletonOnly) {
        if (!present[cand.cell.row][cand.cell.col]) continue; // resolved earlier in this same pass

        if (tryMergeIntoNeighborTail(cand.cell, present, pieceIdGrid, pieces, cols, rows)) {
          resolvedAny = true;
          continue;
        }
        if (tryRescue(cand.cell, present, pieceIdGrid, pieces, rand, cols, rows)) {
          resolvedAny = true;
          continue;
        }
        stillStuck.push(cand.cell);
      }

      if (resolvedAny) continue; // re-scan fresh next pass — merges may have unlocked more growth

      if (stillStuck.length > 0) {
        stillStuck.sort((a, b) => ringOf(a.row, a.col, cols, rows) - ringOf(b.row, b.col, cols, rows));
        for (const cell of stillStuck) {
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
          pieceIdGrid[cell.row][cell.col] = id;
          present[cell.row][cell.col] = false;
        }
      }
      continue;
    }

    const pool = growable;
    const pick = pool[Math.floor(rand() * pool.length)];
    const id = pieces.length;
    const cells: Coord[] = [pick.cell];
    pieceIdGrid[pick.cell.row][pick.cell.col] = id;

    // A growable candidate is always given a target length of at least 2 —
    // otherwise a random low roll would waste a perfectly good growth
    // opportunity on a needless singleton.
    const targetLen = 2 + Math.floor(rand() * (MAX_PIECE_LEN - 2 + 1));
    let cur = pick.cell;
    const direction = pick.growDirs[Math.floor(rand() * pick.growDirs.length)];
    const d = delta(direction);
    const mandatory: Coord = { row: pick.cell.row - d.row, col: pick.cell.col - d.col };
    pieceIdGrid[mandatory.row][mandatory.col] = id;
    cells.push(mandatory);
    cur = mandatory;

    // Without that mandatory first segment, any further growth would place
    // an unconstrained direction right next to the head — exactly what this
    // whole construction exists to avoid. So only keep bending once past it.
    while (cells.length < targetLen) {
      const options = DIRECTIONS.map((dir) => delta(dir))
        .map((dd) => ({ row: cur.row + dd.row, col: cur.col + dd.col }))
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

  return pieces;
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);

  // buildPieces already makes a single-cell piece exceptionally rare (a
  // fraction of a percent of pieces, in well under 10% of boards) rather
  // than eliminating it outright, so retry the whole build with a different
  // sub-seed on the rare board that still has one — empirically this
  // resolves within 1-2 attempts almost every time.
  let pieces = buildPieces(cols, rows, mulberry32(seed));
  for (let attempt = 1; attempt < MAX_GENERATION_ATTEMPTS && pieces.some((p) => p.cells.length < MIN_PIECE_LEN); attempt++) {
    pieces = buildPieces(cols, rows, mulberry32(seed + attempt * 104729));
  }

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
