import { Coord, Direction, Piece, Puzzle } from "./types";
import { mulberry32 } from "./rng";
import { DIRECTIONS, delta, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 1;
const MAX_PIECE_LEN = 5;

interface Candidate {
  cell: Coord;
  dirs: Direction[];
  /** Dirs where a 2-cell piece (this cell + the one directly behind it) still clears. */
  growDirs: Direction[];
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
 *     only left as a single cell when nothing present can grow at all. This
 *     is what keeps the board reading as connected multi-segment lines
 *     rather than a grid of individual tiles: the very first pick that
 *     happens to be blocked behind it no longer forces a singleton the way
 *     it used to.
 *  3. Grow the tail past that mandatory first segment by bending freely to
 *     any available neighbor, as long as the whole piece so far still
 *     clears in the exit direction — this first segment is what makes the
 *     arrow read as a genuine continuation of the piece's own line, not an
 *     arbitrary slide direction unrelated to its shape.
 *  4. Repeat until no present cell has any valid direction left.
 *  5. Guaranteed fallback: any leftover cells (not observed in testing up
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

    const fromGrowable = growable.length > 0;
    const pool = fromGrowable ? growable : singletonOnly;
    const pick = pool[Math.floor(rand() * pool.length)];
    const id = pieces.length;
    const cells: Coord[] = [pick.cell];
    pieceIdGrid[pick.cell.row][pick.cell.col] = id;

    // A growable candidate is always given a target length of at least 2 —
    // otherwise a random low roll would waste a perfectly good growth
    // opportunity on a needless singleton.
    const minLen = fromGrowable ? 2 : MIN_PIECE_LEN;
    const targetLen = minLen + Math.floor(rand() * (MAX_PIECE_LEN - minLen + 1));
    let cur = pick.cell;
    let direction = pick.dirs[Math.floor(rand() * pick.dirs.length)];
    let grewPastHead = false;

    if (fromGrowable && targetLen >= 2) {
      direction = pick.growDirs[Math.floor(rand() * pick.growDirs.length)];
      const d = delta(direction);
      const mandatory: Coord = { row: pick.cell.row - d.row, col: pick.cell.col - d.col };
      pieceIdGrid[mandatory.row][mandatory.col] = id;
      cells.push(mandatory);
      cur = mandatory;
      grewPastHead = true;
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
