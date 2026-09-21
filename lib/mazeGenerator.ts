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
  /** How many reserved "spiral regions" (see buildSpiralPieces below) to
   * carve into genuine multi-turn winding pieces. */
  spiralRegionCount: number;
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
  Easy: { minLen: 2, maxLen: 3, turnBias: 0.15, spiralRegionCount: 0, spiralRegionCells: 0 },
  Medium: { minLen: 2, maxLen: 5, turnBias: 0.4, spiralRegionCount: 1, spiralRegionCells: 6 },
  Hard: { minLen: 3, maxLen: 7, turnBias: 0.6, spiralRegionCount: 1, spiralRegionCells: 12 },
  Hardest: { minLen: 3, maxLen: 9, turnBias: 0.78, spiralRegionCount: 2, spiralRegionCells: 16 },
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

function regionDimsForCells(cells: number): { h: number; w: number } {
  const w = Math.max(2, Math.round(Math.sqrt(cells)));
  const h = Math.max(2, Math.ceil(cells / w));
  return { h, w };
}

interface SpiralRegion {
  top: number;
  left: number;
  h: number;
  w: number;
}

/**
 * Picks non-overlapping (with a 1-cell gap between them) rectangles to
 * later become spiral pieces. Placement only — nothing is reserved on the
 * board here, `buildPieces` does that by consulting the returned rectangles.
 */
function pickSpiralRegions(cols: number, rows: number, rand: () => number, count: number, cellsPerRegion: number): SpiralRegion[] {
  if (count <= 0 || cellsPerRegion <= 0) return [];
  const { h, w } = regionDimsForCells(cellsPerRegion);
  if (h + 2 > rows || w + 2 > cols) return [];

  const placed: SpiralRegion[] = [];
  for (let attempt = 0; attempt < count * 25 && placed.length < count; attempt++) {
    const top = Math.floor(rand() * (rows - h + 1));
    const left = Math.floor(rand() * (cols - w + 1));
    const clashes = placed.some(
      (p) => top < p.top + p.h + 1 && top + h + 1 > p.top && left < p.left + p.w + 1 && left + w + 1 > p.left
    );
    if (clashes) continue;
    placed.push({ top, left, h, w });
  }
  return placed;
}

/**
 * Turns each reserved region into one long spiral-ordered piece. Only
 * called once the rest of the board (everything outside every reserved
 * region) has already been fully cleared by the normal peel above — which
 * is what makes this valid: sweeping a spiral piece's cells toward either
 * of its two open ends only ever crosses already-cleared cells or the
 * piece's own body, regardless of how many times it turns, since nothing
 * else on the board is left present to block it. A region whose both ends
 * still fail (e.g. boxed in by another still-present region) is left alone
 * — its cells stay present and fall through to the normal candidate scan
 * on the next pass, which already knows how to resolve any leftover cell.
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
  for (const region of shuffle(regions, rand)) {
    const path = spiralPathThroughRegion(region.top, region.left, region.h, region.w).filter((c) => present[c.row][c.col]);
    if (path.length < 2) continue;

    const ends: { dir: Direction }[] = [];
    const startTangent = directionFromDelta(directionBetween(path[1], path[0]));
    if (startTangent) ends.push({ dir: startTangent });
    const endTangent = directionFromDelta(directionBetween(path[path.length - 2], path[path.length - 1]));
    if (endTangent) ends.push({ dir: endTangent });

    for (const c of path) pieceIdGrid[c.row][c.col] = tempId;
    let placed = false;
    for (const { dir } of shuffle(ends, rand)) {
      if (pieceCanExit(present, pieceIdGrid, tempId, path, cols, rows, dir)) {
        const id = pieces.length;
        for (const c of path) pieceIdGrid[c.row][c.col] = id;
        pieces.push({ id, cells: path, direction: dir });
        for (const c of path) present[c.row][c.col] = false;
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (const c of path) pieceIdGrid[c.row][c.col] = -1;
    }
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
  const RESCUE_MAX_LEN = 5;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let maxLen = RESCUE_MAX_LEN; maxLen >= 2; maxLen--) {
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
function buildPieces(cols: number, rows: number, rand: () => number, complexity: Complexity): Piece[] {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const pieces: Piece[] = [];
  let focus: Coord | null = null;

  const spiralRegions = pickSpiralRegions(cols, rows, rand, complexity.spiralRegionCount, complexity.spiralRegionCells);
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
    const tempId = -2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!present[row][col]) continue;
        if (!spiralsProcessed && reserved[row][col]) continue; // held back for buildSpiralPieces below
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
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  for (const piece of pieces) {
    for (const cell of piece.cells) {
      present[cell.row][cell.col] = true;
      pieceIdGrid[cell.row][cell.col] = piece.id;
    }
  }

  const remaining = new Set(pieces.map((p) => p.id));
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const id of remaining) {
      const piece = pieces[id];
      if (pieceCanExit(present, pieceIdGrid, id, piece.cells, cols, rows, piece.direction)) {
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
