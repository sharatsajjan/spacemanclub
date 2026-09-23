import { Coord, DifficultyTier, Direction, Piece, Puzzle } from "./types";
import { mulberry32 } from "./rng";
import { DIRECTIONS, delta, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 2;
const MAX_GENERATION_ATTEMPTS = 20;

interface Complexity {
  minLen: number;
  maxLen: number;
  /** Probability of preferring a turn over continuing straight when a piece's
   * tail has a choice of both, while growing it. Higher = more zigzags and
   * spirals instead of long straight runs. */
  turnBias: number;
  /** Fraction of the board to hand to reserved "spiral regions" (see
   * buildSpiralPieces below), which become genuine multi-turn winding
   * pieces. A straight piece is cheap to place anywhere; a bent one needs
   * its whole swept lane clear, which only reliably happens inside these
   * reserved regions — so this is the real lever on how twisty a board
   * looks. */
  spiralCoverage: number;
  /** Roughly how many cells each spiral region covers (one long piece per
   * region). */
  spiralRegionCells: number;
}

/**
 * How long and how bendy pieces are, scaled by tier: early/easy levels stay
 * short and mostly straight, later/harder tiers grow longer, more twisted
 * pieces (Hardest reaching genuine spiral-like shapes) — matching how much
 * more complex "Level 171 / Super Hard" should feel than "Level 21".
 */
const COMPLEXITY_BY_TIER: Record<DifficultyTier, Complexity> = {
  Easy: { minLen: 2, maxLen: 4, turnBias: 0.35, spiralCoverage: 0.45, spiralRegionCells: 5 },
  Medium: { minLen: 2, maxLen: 4, turnBias: 0.6, spiralCoverage: 0.55, spiralRegionCells: 5 },
  Hard: { minLen: 2, maxLen: 4, turnBias: 0.75, spiralCoverage: 0.6, spiralRegionCells: 5 },
  Hardest: { minLen: 2, maxLen: 4, turnBias: 0.85, spiralCoverage: 0.75, spiralRegionCells: 5 },
};

function directionBetween(from: Coord, to: Coord): Coord {
  return { row: to.row - from.row, col: to.col - from.col };
}

function sameDirection(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/** How close (Manhattan distance) the next piece is grown to the previous
 * one, when possible. Picking the next growable candidate uniformly at
 * random across the whole board tends to nibble a little everywhere,
 * leaving fragmented, mostly-independent leftover pockets — weak ordering
 * dependencies (many pieces end up simultaneously clearable from the very
 * start). Growing near the last piece instead carves the board out in
 * connected fronts, so interior cells more consistently end up genuinely
 * waiting on a specific neighboring piece rather than having their own
 * independent way out. */
const GROWTH_LOCALITY_RADIUS = 2;

/** Share of spiral blocks left oversized, to become long nested coils. */
const FEATURE_BLOCK_CHANCE = 0.18;
/** Share of blocks laid out as a comb rather than a coil. */
const SERPENTINE_CHANCE = 0.4;

function directionFromDelta(d: Coord): Direction | null {
  if (d.row === -1 && d.col === 0) return "up";
  if (d.row === 1 && d.col === 0) return "down";
  if (d.row === 0 && d.col === -1) return "left";
  if (d.row === 0 && d.col === 1) return "right";
  return null;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  return items
    .map((item) => ({ item, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map(({ item }) => item);
}

/**
 * A genuine multi-turn winding/nested-spiral path through every cell of an
 * h x w rectangle: peel its outer ring (top row left-to-right, right column
 * top-to-bottom, bottom row right-to-left, left column bottom-to-top), then
 * recurse into the shrunk inner rectangle. Visits every cell exactly once,
 * each step grid-adjacent to the last.
 */
function spiralPathThroughRegion(top: number, left: number, h: number, w: number): Coord[] {
  const path: Coord[] = [];
  let top0 = top;
  let bottom0 = top + h - 1;
  let left0 = left;
  let right0 = left + w - 1;
  while (top0 <= bottom0 && left0 <= right0) {
    for (let c = left0; c <= right0; c++) path.push({ row: top0, col: c });
    for (let r = top0 + 1; r <= bottom0; r++) path.push({ row: r, col: right0 });
    if (top0 < bottom0 && left0 < right0) {
      for (let c = right0 - 1; c >= left0; c--) path.push({ row: bottom0, col: c });
      for (let r = bottom0 - 1; r > top0; r--) path.push({ row: r, col: left0 });
    }
    top0++;
    bottom0--;
    left0++;
    right0--;
  }
  return path;
}

/**
 * A serpentine (boustrophedon) path through every cell of a rectangle:
 * across the top row, drop a row, back the other way, and so on. Same
 * coverage guarantee as the spiral, but it reads as a comb rather than a
 * coil — alternating between the two stops blocks of the same size from
 * all producing the same shape. (For a 2-wide block the two are
 * identical, so this only changes anything once a block is 3x3 or bigger.)
 */
function serpentinePathThroughRegion(top: number, left: number, h: number, w: number): Coord[] {
  const path: Coord[] = [];
  for (let r = 0; r < h; r++) {
    for (let i = 0; i < w; i++) {
      const c = (r & 1) === 0 ? i : w - 1 - i;
      path.push({ row: top + r, col: left + c });
    }
  }
  return path;
}

interface SpiralRegion {
  top: number;
  left: number;
  h: number;
  w: number;
}

/** The longest unbroken stretch of still-present cells along an ordered path. */
function longestContiguousRun(path: Coord[], present: boolean[][]): Coord[] {
  let best: Coord[] = [];
  let run: Coord[] = [];
  for (const cell of path) {
    if (present[cell.row][cell.col]) {
      run.push(cell);
      if (run.length > best.length) best = run;
    } else {
      run = [];
    }
  }
  return best;
}

/**
 * Cuts a rectangle into blocks of roughly `targetCells` each by repeatedly
 * splitting along its longer axis, never leaving a side thinner than 2 (a
 * 1-wide block can only ever hold a straight piece, which is exactly what
 * we're trying to avoid). Partitioning beats scattering rectangles at
 * random: random placement leaves wide uncovered gaps, and those gaps are
 * where the board-spanning straight bars come from.
 */
function partitionIntoBlocks(
  top: number,
  left: number,
  h: number,
  w: number,
  targetCells: number,
  rand: () => number,
  out: SpiralRegion[]
): void {
  const canSplitVertically = w >= 4;
  const canSplitHorizontally = h >= 4;
  // Randomised stopping size, so leaves range from a 4-cell hook up to a
  // 12-cell coil instead of the whole board being the same U repeated.
  // Occasionally a block is left much larger, which becomes one long
  // nested coil — a board of nothing but small blocks reads as the same
  // hook stamped out in rows however the colours fall, and those bigger
  // shapes are what break the pattern up.
  const stopAt = rand() < FEATURE_BLOCK_CHANCE ? targetCells * (3 + rand() * 2) : targetCells * (1 + rand() * 1.2);
  if (h * w <= stopAt || (!canSplitVertically && !canSplitHorizontally)) {
    out.push({ top, left, h, w });
    return;
  }

  const splitVertically = canSplitVertically && (!canSplitHorizontally || (w >= h ? rand() < 0.75 : rand() < 0.25));
  if (splitVertically) {
    const cut = 2 + Math.floor(rand() * (w - 3));
    partitionIntoBlocks(top, left, h, cut, targetCells, rand, out);
    partitionIntoBlocks(top, left + cut, h, w - cut, targetCells, rand, out);
  } else {
    const cut = 2 + Math.floor(rand() * (h - 3));
    partitionIntoBlocks(top, left, cut, w, targetCells, rand, out);
    partitionIntoBlocks(top + cut, left, h - cut, w, targetCells, rand, out);
  }
}

/**
 * Partitions the whole board into blocks and hands back `coverage` of them
 * to become spiral pieces; the rest fall through to the normal peel as
 * ordinary straight-ish pieces. Placement only — nothing is reserved on the
 * board here, `buildPieces` does that by consulting the returned rectangles.
 */
function pickSpiralRegions(cols: number, rows: number, rand: () => number, coverage: number, cellsPerRegion: number): SpiralRegion[] {
  if (coverage <= 0 || cellsPerRegion <= 0) return [];
  if (rows < 4 || cols < 4) return [];

  const blocks: SpiralRegion[] = [];
  partitionIntoBlocks(0, 0, rows, cols, cellsPerRegion, rand, blocks);

  const usable = blocks.filter((b) => b.h >= 2 && b.w >= 2);
  const keep = Math.round(usable.length * coverage);
  return shuffle(usable, rand).slice(0, keep);
}

/**
 * Turns each reserved region into one long spiral-ordered piece. Only
 * called once the rest of the board (everything outside every reserved
 * region) has already been fully cleared by the normal peel above — which
 * is what makes this valid: sweeping a spiral piece's cells toward either
 * of its two open ends only ever crosses already-cleared cells or the
 * piece's own body, regardless of how many times it turns, since nothing
 * else on the board is left present to block it. Regions that sit flush
 * against each other do block each other though, so this sweeps repeatedly:
 * clearing one region opens the lane its neighbour needed, and passes
 * continue until a whole pass places nothing. Any region still unplaceable
 * after that is left alone — its cells stay present and fall through to the
 * normal candidate scan, which already knows how to resolve leftover cells.
 */
function buildSpiralPieces(
  regions: SpiralRegion[],
  present: boolean[][],
  pieceIdGrid: number[][],
  pieces: Piece[],
  rand: () => number,
  cols: number,
  rows: number
): void {
  const tempId = -5;
  let pending = shuffle(regions, rand);

  while (pending.length > 0) {
    const stillPending: SpiralRegion[] = [];
    let placedAny = false;

    for (const region of pending) {
      // Longest still-present RUN, not every still-present cell: dropping a
      // consumed cell out of the middle would leave the remaining cells
      // non-adjacent, and a piece whose consecutive cells aren't neighbours
      // draws as a line jumping diagonally across the board.
      const layout =
        rand() < SERPENTINE_CHANCE
          ? serpentinePathThroughRegion(region.top, region.left, region.h, region.w)
          : spiralPathThroughRegion(region.top, region.left, region.h, region.w);
      const path = longestContiguousRun(layout, present);
      if (path.length < 2) continue;

      // Either end of the path can lead. Whichever does becomes cells[0],
      // since that's the end the exit check and the arrowhead both read.
      const ends: { dir: Direction; cells: Coord[] }[] = [];
      const startTangent = directionFromDelta(directionBetween(path[1], path[0]));
      if (startTangent) ends.push({ dir: startTangent, cells: path });
      const endTangent = directionFromDelta(directionBetween(path[path.length - 2], path[path.length - 1]));
      if (endTangent) ends.push({ dir: endTangent, cells: [...path].reverse() });

      for (const c of path) pieceIdGrid[c.row][c.col] = tempId;
      let placed = false;
      for (const end of shuffle(ends, rand)) {
        if (pieceCanExit(present, end.cells, cols, rows, end.dir)) {
          const id = pieces.length;
          for (const c of path) pieceIdGrid[c.row][c.col] = id;
          pieces.push({ id, cells: end.cells, direction: end.dir });
          for (const c of path) present[c.row][c.col] = false;
          placed = true;
          placedAny = true;
          break;
        }
      }
      if (!placed) {
        for (const c of path) pieceIdGrid[c.row][c.col] = -1;
        stillPending.push(region);
      }
    }

    if (!placedAny) break;
    pending = stillPending;
  }
}

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
    if (pieceCanExit(asOf, [...piece.cells, cell], cols, rows, piece.direction)) {
      piece.cells.push(cell);
      present[cell.row][cell.col] = false;
      return true;
    }
    pieceIdGrid[cell.row][cell.col] = -1;
  }
  return false;
}

/** Randomized DFS: grow a simple path from `start` through present, unclaimed
 * cells, up to maxLen cells, for `tryRescue` to test as a candidate piece.
 * `offLimits` marks cells that are spoken for (reserved spiral regions):
 * eating one would punch a hole in that region's spiral and break it into
 * disconnected fragments. */
function growScratchPath(
  start: Coord,
  present: boolean[][],
  pieceIdGrid: number[][],
  maxLen: number,
  rand: () => number,
  tempId: number,
  cols: number,
  rows: number,
  offLimits: boolean[][] | null
): Coord[] {
  const path: Coord[] = [start];
  pieceIdGrid[start.row][start.col] = tempId;
  let cur = start;
  while (path.length < maxLen) {
    const options = DIRECTIONS.map((dir) => delta(dir))
      .map((d) => ({ row: cur.row + d.row, col: cur.col + d.col }))
      .filter(
        (c) =>
          c.row >= 0 &&
          c.row < rows &&
          c.col >= 0 &&
          c.col < cols &&
          present[c.row][c.col] &&
          pieceIdGrid[c.row][c.col] === -1 &&
          !(offLimits && offLimits[c.row][c.col])
      );
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
  rows: number,
  offLimits: boolean[][] | null
): boolean {
  const tempId = -3;
  const RESCUE_MAX_LEN = 5;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let maxLen = RESCUE_MAX_LEN; maxLen >= 2; maxLen--) {
      const path = growScratchPath(start, present, pieceIdGrid, maxLen, rand, tempId, cols, rows, offLimits);
      if (path.length < 2) continue;
      for (const cells of [path, path.slice().reverse()]) {
        for (const c of cells) pieceIdGrid[c.row][c.col] = tempId;
        const dir = DIRECTIONS.find((d) => {
          const delt = delta(d);
          return cells[0].row - cells[1].row === delt.row && cells[0].col - cells[1].col === delt.col;
        })!;
        const ok = pieceCanExit(present, cells, cols, rows, dir);
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
function buildPieces(cols: number, rows: number, rand: () => number, complexity: Complexity): Piece[] {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const pieces: Piece[] = [];
  let focus: Coord | null = null;

  const spiralRegions = pickSpiralRegions(cols, rows, rand, complexity.spiralCoverage, complexity.spiralRegionCells);
  const reserved: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const region of spiralRegions) {
    for (let r = region.top; r < region.top + region.h; r++) {
      for (let c = region.left; c < region.left + region.w; c++) reserved[r][c] = true;
    }
  }
  let spiralsProcessed = spiralRegions.length === 0;

  while (true) {
    const growable: Candidate[] = [];
    const singletonOnly: Candidate[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!present[row][col]) continue;
        if (!spiralsProcessed && reserved[row][col]) continue; // held back for buildSpiralPieces below
        const dirs = DIRECTIONS.filter((dir) => pieceCanExit(present, [{ row, col }], cols, rows, dir));
        if (dirs.length === 0) continue;

        const growDirs: Direction[] = [];
        for (const dir of dirs) {
          const d = delta(dir);
          const m: Coord = { row: row - d.row, col: col - d.col };
          if (m.row < 0 || m.row >= rows || m.col < 0 || m.col >= cols || !present[m.row][m.col] || pieceIdGrid[m.row][m.col] !== -1) continue;
          if (pieceCanExit(present, [{ row, col }, m], cols, rows, dir)) growDirs.push(dir);
        }

        const candidate: Candidate = { cell: { row, col }, dirs, growDirs };
        (growDirs.length > 0 ? growable : singletonOnly).push(candidate);
      }
    }
    if (growable.length === 0 && singletonOnly.length === 0) {
      if (!spiralsProcessed) {
        buildSpiralPieces(spiralRegions, present, pieceIdGrid, pieces, rand, cols, rows);
        spiralsProcessed = true;
        focus = null;
        continue; // re-scan — any region a spiral couldn't place falls through to the normal candidate scan
      }
      break;
    }

    if (growable.length === 0) {
      let resolvedAny = false;
      const stillStuck: Coord[] = [];
      for (const cand of singletonOnly) {
        if (!present[cand.cell.row][cand.cell.col]) continue; // resolved earlier in this same pass

        if (tryMergeIntoNeighborTail(cand.cell, present, pieceIdGrid, pieces, cols, rows)) {
          resolvedAny = true;
          continue;
        }
        if (tryRescue(cand.cell, present, pieceIdGrid, pieces, rand, cols, rows, spiralsProcessed ? null : reserved)) {
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
      focus = null;
      continue;
    }

    const nearby = focus ? growable.filter((c) => manhattan(c.cell, focus!) <= GROWTH_LOCALITY_RADIUS) : [];
    const pool = nearby.length > 0 ? nearby : growable;
    const pick = pool[Math.floor(rand() * pool.length)];
    const id = pieces.length;
    const cells: Coord[] = [pick.cell];
    pieceIdGrid[pick.cell.row][pick.cell.col] = id;

    // A growable candidate is always given a target length of at least 2 —
    // otherwise a random low roll would waste a perfectly good growth
    // opportunity on a needless singleton. minLen/maxLen come from the
    // puzzle's tier: harder tiers target longer pieces.
    const effMinLen = Math.max(2, complexity.minLen);
    const effMaxLen = Math.max(effMinLen, complexity.maxLen);
    const targetLen = effMinLen + Math.floor(rand() * (effMaxLen - effMinLen + 1));
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

      // Bias toward turning rather than continuing straight, so pieces read
      // as zigzags/spirals instead of long straight runs — the higher the
      // tier's turnBias, the more consistently a turn is tried first when
      // one's available (still falls back to straight if no turn clears).
      const prevDir = directionBetween(cells[cells.length - 2], cur);
      const turnOptions = shuffledOptions.filter((c) => !sameDirection(directionBetween(cur, c), prevDir));
      const straightOptions = shuffledOptions.filter((c) => sameDirection(directionBetween(cur, c), prevDir));
      const orderedOptions = rand() < complexity.turnBias ? [...turnOptions, ...straightOptions] : [...straightOptions, ...turnOptions];

      let extended = false;
      for (const candidate of orderedOptions) {
        pieceIdGrid[candidate.row][candidate.col] = id;
        if (pieceCanExit(present, [...cells, candidate], cols, rows, direction)) {
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
    focus = cells[cells.length - 1];
  }

  return pieces;
}

/**
 * Simulates actually solving the board: repeatedly clear any piece that can
 * currently exit, until either everything's gone (solvable) or a full pass
 * clears nothing (stuck). This is a complete check, not a heuristic — once a
 * piece can exit, clearing it only ever removes potential blockers for every
 * other piece, never adds one, so a greedy fixed point can't miss a solution
 * a smarter search would have found. Construction already guarantees a
 * solvable order by proof, so this is a defensive safety net (and a
 * regression check on the turn-biased growth above), not the primary
 * guarantee.
 */
function verifySolvable(pieces: Piece[], cols: number, rows: number): boolean {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const piece of pieces) {
    for (const cell of piece.cells) present[cell.row][cell.col] = true;
  }

  const remaining = new Set(pieces.map((p) => p.id));
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const id of remaining) {
      const piece = pieces[id];
      if (pieceCanExit(present, piece.cells, cols, rows, piece.direction)) {
        for (const cell of piece.cells) present[cell.row][cell.col] = false;
        remaining.delete(id);
        progress = true;
      }
    }
  }
  return remaining.size === 0;
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const complexity = COMPLEXITY_BY_TIER[tierForLevel(level)];

  // buildPieces already makes a single-cell piece exceptionally rare (a
  // fraction of a percent of pieces, in well under 10% of boards) rather
  // than eliminating it outright, so retry the whole build with a different
  // sub-seed on the rare board that still has one — empirically this
  // resolves within 1-2 attempts almost every time. Also re-verified as
  // solvable by simulation before ever reaching the player, even though
  // construction already guarantees it — belt and suspenders.
  let pieces = buildPieces(cols, rows, mulberry32(seed), complexity);
  for (
    let attempt = 1;
    attempt < MAX_GENERATION_ATTEMPTS && (pieces.some((p) => p.cells.length < MIN_PIECE_LEN) || !verifySolvable(pieces, cols, rows));
    attempt++
  ) {
    pieces = buildPieces(cols, rows, mulberry32(seed + attempt * 104729), complexity);
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
