import { Coord, DifficultyTier, Direction, Piece, Puzzle } from "./types";
import { mulberry32 } from "./rng";
import { DIRECTIONS, delta, pieceCanExit, ringOf } from "./rules";
import { gridForLevel, tierForLevel } from "./difficultyWave";

const MIN_PIECE_LEN = 2;
const MAX_GENERATION_ATTEMPTS = 20;

interface Complexity {
  minLen: number;
  maxLen: number;
  /** Probability of preferring a turn over continuing straight, once the
   * piece has already run its minStraightRun and is free to do either.
   * Deliberately low: a maze is long runs meeting at clean corners, and a
   * piece that takes every turn on offer draws a comb instead. */
  turnBias: number;
  /** Fraction of the board to hand to reserved "spiral regions" (see
   * buildSpiralPieces below), which become genuine multi-turn winding
   * pieces.
   *
   * This used to be the main source of twisty shapes, and was set high
   * because ordinary growth could not produce them. It no longer is: once
   * growth could run long without stranding cells, it started producing
   * pieces of fifteen-plus cells with six or more bends by itself. Spiral
   * blocks are now a garnish, and a costly one — their pieces are placed by
   * whichever end can exit rather than by what they'd be waiting on, so
   * every cell handed to a block is a cell that isn't part of the board's
   * dependency chain. Halving this roughly halved the number of legal moves
   * a player has at any moment. */
  spiralCoverage: number;
  /** Roughly how many cells each spiral region covers — one piece per
   * region, so this is how big a coil gets.
   *
   * Small regions only make hooks and U-bends, which the ordinary growth
   * already produces plenty of. A coil only reads as a coil once it has
   * room to wind around itself two or three times, which takes a region of
   * thirty cells or more. */
  spiralRegionCells: number;
  /** How often a piece's exit direction is chosen to run back over pieces
   * already built, rather than at random. See pickExitDirection: this is
   * what decides whether the board is a pile of independently-clearable
   * pieces or a puzzle with an order to work out. */
  dependencyBias: number;
  /** How many cells a piece must run straight before it is allowed to turn
   * again. See the growth loop: this is what makes a piece read as long
   * runs joined by clean corners instead of a row of one-cell teeth. */
  minStraightRun: number;
  /** Share of pieces drawn from the long end of the range instead of the
   * short end. The rest come out short, so a board carries both. */
  longPieceChance: number;
  /** Longest a "short" piece gets. Short pieces are not filler: they are
   * quick to read but there are many of them, and they pack into the gaps
   * the long ones leave. */
  shortPieceCap: number;
}

/**
 * How long and how bendy pieces are, scaled by tier.
 *
 * minLen stays at 2 for every tier and the range is wide. Length is chosen
 * from one END of that range or the other — see the growth loop — so a board
 * carries short pieces and long ones together rather than a single size.
 * That mix is the point: long pieces lie across many lanes and hold the
 * board up, short ones are quick to read but there are a lot of them and
 * they pack into the gaps the long ones leave. A board where every piece is
 * the same size is easier to read whatever that size is.
 *
 * Easy tiers lean short, as the breather in the difficulty wave.
 */
const COMPLEXITY_BY_TIER: Record<DifficultyTier, Complexity> = {
  Easy: { minLen: 2, maxLen: 16, turnBias: 0.15, spiralCoverage: 0.3, spiralRegionCells: 16, dependencyBias: 0.75, minStraightRun: 5, longPieceChance: 0.3, shortPieceCap: 5 },
  Medium: { minLen: 2, maxLen: 24, turnBias: 0.2, spiralCoverage: 0.3, spiralRegionCells: 25, dependencyBias: 0.9, minStraightRun: 6, longPieceChance: 0.4, shortPieceCap: 6 },
  Hard: { minLen: 2, maxLen: 32, turnBias: 0.2, spiralCoverage: 0.32, spiralRegionCells: 34, dependencyBias: 0.97, minStraightRun: 7, longPieceChance: 0.5, shortPieceCap: 6 },
  Hardest: { minLen: 2, maxLen: 40, turnBias: 0.25, spiralCoverage: 0.35, spiralRegionCells: 42, dependencyBias: 1, minStraightRun: 8, longPieceChance: 0.55, shortPieceCap: 7 },
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

/** How many about-to-be-orphaned cells one piece will pick up on its way
 * past, before it's grown far beyond the length its tier asked for. */
const STRANDED_SWEEP_LIMIT = 3;

/** A piece has to be at least this long to be worth making a bottleneck of:
 * a short one lies across too few lanes for anything to hang off it. */
const KEYSTONE_MIN_LEN = 5;
/** How many pieces are built trying to hang off a keystone before another is
 * chosen. This is roughly how many pieces one bottleneck releases. */
const KEYSTONE_FAN = 7;
/** How often a long piece is made a keystone rather than left ordinary. */
const KEYSTONE_CHANCE = 0.6;

/** Share of spiral blocks left oversized, to become long nested coils. */
const FEATURE_BLOCK_CHANCE = 0.18;
/** Share of blocks laid out as a comb rather than a coil. */
const SERPENTINE_CHANCE = 0.3;

/**
 * The highest-numbered already-built piece in a head's exit lane, or -1 if
 * the lane is clear of them.
 *
 * Pieces are built in the order they'll be cleared, so this one number is
 * what decides the puzzle's shape: a piece becomes tappable the moment the
 * LAST piece in its lane is gone, and in build order that is the highest id.
 * -1 means nothing blocks it and it's tappable from the opening move.
 *
 * It is the id, not the number of pieces crossed, that matters. A piece
 * crossing six earlier pieces is still unlocked by exactly one of them —
 * the newest — and the other five are irrelevant to when it opens up.
 */
function laneBlocker(head: Coord, dir: Direction, pieceIdGrid: number[][], cols: number, rows: number): number {
  return laneBlockerInfo(head, dir, pieceIdGrid, cols, rows).id;
}

/**
 * The lane's blocker, plus how far along the lane it sits.
 *
 * The distance is what decides whether a piece is a puzzle or a glance.
 * Everything nearer than the blocker has a lower id, so it clears first —
 * meaning that by the time the piece is nearly ready its lane is open for
 * `dist` cells and then stopped. A piece with dist 1 is dismissed instantly:
 * the cell in front of the arrow is full. A piece with dist 12 looks open
 * and isn't, and the only way to tell is to follow the lane.
 */
function laneBlockerInfo(
  head: Coord,
  dir: Direction,
  pieceIdGrid: number[][],
  cols: number,
  rows: number
): { id: number; dist: number } {
  const d = delta(dir);
  let id = -1;
  let dist = 0;
  let steps = 0;
  let r = head.row + d.row;
  let c = head.col + d.col;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    steps++;
    const here = pieceIdGrid[r][c];
    if (here > id) {
      id = here;
      dist = steps;
    }
    r += d.row;
    c += d.col;
  }
  return { id, dist };
}

/**
 * Which way a new piece points.
 *
 * Picking at random left most pieces exiting straight to the nearest edge
 * over empty space: a ~90 piece board opened with 36 legal moves, no piece
 * unlocked more than three others, and nearly half gated nothing at all.
 * There was a correct order, but nothing ever forced the player to find it.
 *
 * Two preferences fix that, both applied only `dependencyBias` of the time
 * so boards keep some slack:
 *
 *  - With a keystone set, prefer a lane whose last blocker is exactly that
 *    piece. Several pieces in a row pointing back through the same one make
 *    it a genuine bottleneck: nothing behind it moves until it goes, and
 *    then several things open at once.
 *  - Otherwise prefer the lane with the newest blocker, which hands the
 *    piece the longest possible wait and keeps the number of simultaneously
 *    legal moves down.
 *
 * Solvability is untouched either way: a lane can only cross pieces built
 * BEFORE this one, and those are cleared first by construction.
 */
/** The best lane a candidate could take, judged the way pickCandidate judges
 * it: furthest blocker first, newest to break a tie. */
function candidateBlockerInfo(
  candidate: Candidate,
  pieceIdGrid: number[][],
  cols: number,
  rows: number
): { id: number; dist: number } {
  let best = { id: -1, dist: -1 };
  for (const dir of candidate.growDirs) {
    const info = laneBlockerInfo(candidate.cell, dir, pieceIdGrid, cols, rows);
    if (info.dist > best.dist || (info.dist === best.dist && info.id > best.id)) best = info;
  }
  return best;
}

/**
 * Which cell the next piece is grown from.
 *
 * This, not the exit direction, is where a board's dependency structure
 * actually comes from. By the time a cell is a growable candidate its
 * direction is all but decided — measured over a full board, a candidate
 * has 1.06 legal directions on average, so there is nothing to choose
 * between. Choosing the CELL is choosing which piece the new one will
 * wait on.
 *
 * So candidates are ranked by their last blocker, the same way directions
 * were: behind the current keystone first, then whichever waits on the
 * newest piece. Picking at random instead peeled the board like an onion —
 * every piece on the perimeter independently tappable, ~36 legal opening
 * moves, and no piece that mattered more than any other.
 */
function pickCandidate(
  pool: Candidate[],
  pieceIdGrid: number[][],
  cols: number,
  rows: number,
  rand: () => number,
  dependencyBias: number,
  keystoneId: number
): Candidate {
  const shuffled = shuffle(pool, rand);
  if (rand() >= dependencyBias) return shuffled[0];

  // Match the keystone against EVERY direction the candidate could take, not
  // against its best one: a candidate with a lane behind the keystone and
  // another behind some newer piece scores as the newer piece, which hid
  // most of the pieces that could have hung off the keystone.
  if (keystoneId >= 0) {
    const behindKeystone = shuffled.find((candidate) =>
      candidate.growDirs.some((dir) => laneBlocker(candidate.cell, dir, pieceIdGrid, cols, rows) === keystoneId)
    );
    if (behindKeystone) return behindKeystone;
  }
  // Otherwise the candidate whose blocker sits FURTHEST down its lane,
  // breaking ties toward the newest blocker. Ranking by newest alone left
  // boards where 80% of pieces were blocked by the cell directly in front of
  // the arrow, so nothing ever had to be traced.
  const scored = shuffled.map((candidate) => ({ candidate, ...candidateBlockerInfo(candidate, pieceIdGrid, cols, rows) }));
  return scored.reduce((a, b) => (b.dist > a.dist || (b.dist === a.dist && b.id > a.id) ? b : a)).candidate;
}

function pickExitDirection(
  head: Coord,
  dirs: Direction[],
  pieceIdGrid: number[][],
  cols: number,
  rows: number,
  rand: () => number,
  dependencyBias: number,
  keystoneId: number
): Direction {
  const shuffled = shuffle(dirs, rand);
  if (rand() >= dependencyBias) return shuffled[0];

  const scored = shuffled.map((dir) => ({ dir, ...laneBlockerInfo(head, dir, pieceIdGrid, cols, rows) }));
  if (keystoneId >= 0) {
    const behindKeystone = scored.find((s) => s.id === keystoneId);
    if (behindKeystone) return behindKeystone.dir;
  }
  return scored.reduce((a, b) => (b.dist > a.dist || (b.dist === a.dist && b.id > a.id) ? b : a)).dir;
}

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
function buildPieces(cols: number, rows: number, rand: () => number, complexity: Complexity): Piece[] | null {
  const present: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pieceIdGrid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const pieces: Piece[] = [];
  let focus: Coord | null = null;
  /** The piece the next few are being built to hang off, and how many of
   * them are left to build. -1 = none currently. */
  let keystoneId = -1;
  let keystoneBudget = 0;

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
      const stillStuck: Candidate[] = [];
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
        stillStuck.push(cand);
      }

      if (resolvedAny) continue; // re-scan fresh next pass — merges may have unlocked more growth

      if (stillStuck.length > 0) {
        stillStuck.sort((a, b) => ringOf(a.cell.row, a.cell.col, cols, rows) - ringOf(b.cell.row, b.cell.col, cols, rows));
        for (const cand of stillStuck) {
          const cell = cand.cell;
          // Point it down a lane that is actually clear RIGHT NOW, re-checked
          // against the current board rather than trusted from the scan.
          //
          // This used to aim the cell at its nearest edge on the reasoning
          // that the way out only crosses lower rings, which are cleared by
          // then. That does not hold: a lower-ring cell can still belong to a
          // piece not yet built — a reserved spiral region, or anything the
          // scan hasn't reached — and the result was a piece permanently
          // pointed into another. One board produced a straight deadlock, a
          // 1-cell piece pointing right into a 7-cell piece pointing left,
          // each waiting on the other, which no amount of play could undo.
          const usable = DIRECTIONS.filter((dir) => pieceCanExit(present, [cell], cols, rows, dir));
          if (usable.length === 0) return null; // unplaceable — abandon this attempt
          const nearest = (dir: Direction) =>
            dir === "up" ? cell.row : dir === "down" ? rows - 1 - cell.row : dir === "left" ? cell.col : cols - 1 - cell.col;
          const best = Math.min(...usable.map(nearest));
          const tied = usable.filter((dir) => nearest(dir) === best);
          const id = pieces.length;
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
    const pick = pickCandidate(pool, pieceIdGrid, cols, rows, rand, complexity.dependencyBias, keystoneId);
    const id = pieces.length;
    const cells: Coord[] = [pick.cell];
    pieceIdGrid[pick.cell.row][pick.cell.col] = id;

    // A growable candidate is always given a target length of at least 2 —
    // otherwise a random low roll would waste a perfectly good growth
    // opportunity on a needless singleton. minLen/maxLen come from the
    // puzzle's tier: harder tiers target longer pieces.
    const effMinLen = Math.max(2, complexity.minLen);
    const effMaxLen = Math.max(effMinLen, complexity.maxLen);
    // Draw from one end of the range or the other, rather than uniformly
    // across it, so a board carries both kinds. Raising the MINIMUM length
    // to get longer pieces is what went wrong before: it removed the short
    // ones instead of adding long ones, and a board of pieces that are all
    // the same size is easier to read whatever that size is. A mix means
    // more pieces, more of them lying across each other, and no single
    // glance that takes in the whole board.
    const longEnd = Math.max(effMinLen, Math.round(effMaxLen * 0.55));
    const shortEnd = Math.max(effMinLen, Math.min(complexity.shortPieceCap, effMaxLen));
    const targetLen =
      rand() < complexity.longPieceChance
        ? longEnd + Math.floor(rand() * (effMaxLen - longEnd + 1))
        : effMinLen + Math.floor(rand() * (shortEnd - effMinLen + 1));
    let cur = pick.cell;
    const direction = pickExitDirection(pick.cell, pick.growDirs, pieceIdGrid, cols, rows, rand, complexity.dependencyBias, keystoneId);
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
      const byTurn = rand() < complexity.turnBias ? [...turnOptions, ...straightOptions] : [...straightOptions, ...turnOptions];

      // How far the piece has already run in its current direction.
      let straightSoFar = 1;
      for (let i = cells.length - 1; i >= 2; i--) {
        const q = cells[i - 2], a = cells[i - 1], b = cells[i];
        if (q.row - a.row !== a.row - b.row || q.col - a.col !== a.col - b.col) break;
        straightSoFar++;
      }
      // Below the tier's minimum, going straight outranks everything. Left to
      // itself the growth turned at almost every opportunity — 71% of its
      // straight runs were a single cell, which draws a comb of one-cell
      // teeth rather than the long runs and clean corners a maze is made of.
      const runNeeded = Math.max(2, Math.min(complexity.minStraightRun, Math.floor(targetLen / 2)));
      const mustRunOn = straightSoFar < runNeeded;
      const keepsGoing = (c: Coord) => sameDirection(directionBetween(cur, c), prevDir);

      // Warnsdorff's rule, the standard way to grow a long path through a
      // grid without painting yourself into a corner: step into the cell
      // with the FEWEST free neighbours left, so the tightest pockets get
      // used up while they are still reachable. Without it, longer pieces
      // snake past narrow gaps and seal cells off — pushing maximum piece
      // length up drove stranded single cells from roughly one a board to
      // four. Turn preference decides between cells that are equally
      // constrained, so the zigzag shapes survive.
      const freeNeighbours = (c: Coord) =>
        DIRECTIONS.filter((dir) => {
          const dd = delta(dir);
          const n = { row: c.row + dd.row, col: c.col + dd.col };
          return n.row >= 0 && n.row < rows && n.col >= 0 && n.col < cols && present[n.row][n.col] && pieceIdGrid[n.row][n.col] === -1;
        }).length;
      const orderedOptions = byTurn
        .map((c, i) => ({ c, i, free: freeNeighbours(c), holdsLine: mustRunOn && keepsGoing(c) ? 0 : 1 }))
        .sort((a, b) => a.holdsLine - b.holdsLine || a.free - b.free || a.i - b.i)
        .map(({ c }) => c);

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

    // Sweep up as we go: a free cell touching this piece's tail that has no
    // other free neighbour is about to become a lone 1-cell piece, so take
    // it along instead. Stranding is the price of growing long pieces —
    // they carve the board into odd remainders far more than short ones did
    // — and mopping up afterwards salvages far fewer of them than simply
    // not leaving them behind.
    for (let swept = 0; swept < STRANDED_SWEEP_LIMIT; swept++) {
      const tail = cells[cells.length - 1];
      const isFree = (c: Coord) =>
        c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols && present[c.row][c.col] && pieceIdGrid[c.row][c.col] === -1;
      const orphan = DIRECTIONS.map((dir) => {
        const dd = delta(dir);
        return { row: tail.row + dd.row, col: tail.col + dd.col };
      }).find((n) => isFree(n) && DIRECTIONS.every((dir) => {
        const dd = delta(dir);
        return !isFree({ row: n.row + dd.row, col: n.col + dd.col });
      }));
      if (!orphan) break;
      pieceIdGrid[orphan.row][orphan.col] = id;
      if (!pieceCanExit(present, [...cells, orphan], cols, rows, direction)) {
        pieceIdGrid[orphan.row][orphan.col] = -1;
        break;
      }
      cells.push(orphan);
    }

    pieces.push({ id, cells, direction });
    for (const cell of cells) present[cell.row][cell.col] = false;
    focus = cells[cells.length - 1];

    // Hand the next few pieces a bottleneck to hang off, once this one has
    // had its run. Only a long piece is worth it — see KEYSTONE_MIN_LEN.
    if (keystoneBudget > 0) keystoneBudget--;
    if (keystoneBudget === 0 && cells.length >= KEYSTONE_MIN_LEN && rand() < KEYSTONE_CHANCE) {
      keystoneId = id;
      keystoneBudget = KEYSTONE_FAN;
    }
  }

  // Any cell the loop could not account for would be a hole in the tiling,
  // and a hole is a cell that can never be cleared.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (present[r][c]) return null;
    }
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

/** Re-lays a piece list so every piece's id matches its index again, which
 * the solver and the renderer both rely on. */
function renumber(pieces: Piece[]): Piece[] {
  return pieces.map((p, id) => ({ ...p, id }));
}

/**
 * Folds leftover 1-cell pieces into a neighbour, so a board doesn't end up
 * dotted with lone cells. Longer pieces strand more odd cells than short
 * ones did, so this is what keeps lengthening them from costing tidiness.
 *
 * Folding into a piece that clears earlier is the safe direction — the cell
 * then leaves sooner, and leaving sooner can only unblock other pieces,
 * never strand one — so those hosts are tried first. A later host can work
 * too though, and restricting it to the safe direction alone salvaged almost
 * nothing, so every fold is simply simulated: the whole board is re-solved
 * afterwards and the fold undone unless it still completes. That check, not
 * the ordering argument, is what makes this safe.
 */
function absorbSingles(pieces: Piece[], cols: number, rows: number): Piece[] {
  let current = pieces;
  for (let guard = 0; guard < pieces.length; guard++) {
    const single = current.find((p) => p.cells.length < MIN_PIECE_LEN);
    if (!single) break;
    const cell = single.cells[0];
    // Any piece whose TAIL touches the cell. Not the head end: cells[0] is
    // the head, and moving that would change where the piece exits from.
    // Earlier-clearing hosts are tried first, since moving the cell earlier
    // in the order can only unblock other pieces — but a later host is
    // allowed too, because the simulation below is what actually decides.
    const hosts = current
      .filter((host) => {
        if (host.id === single.id) return false;
        const tail = host.cells[host.cells.length - 1];
        return Math.abs(tail.row - cell.row) + Math.abs(tail.col - cell.col) === 1;
      })
      .sort((a, b) => (a.id < single.id ? 0 : 1) - (b.id < single.id ? 0 : 1));
    let folded: Piece[] | null = null;
    for (const host of hosts) {
      const trial = renumber(
        current
          .filter((p) => p.id !== single.id)
          .map((p) => (p.id === host.id ? { ...p, cells: [...p.cells, cell] } : p))
      );
      if (verifySolvable(trial, cols, rows)) {
        folded = trial;
        break;
      }
    }
    if (!folded) {
      // Nothing could take the cell, so try the reverse: have the single
      // TAKE the tail cell of a long neighbour, which turns a 1-cell piece
      // into a 2-cell one at the cost of shortening a piece that can spare
      // it. Only the tail can move — cells[0] is the head, and the rest of
      // the path has to stay contiguous.
      for (const donor of current) {
        if (donor.id === single.id || donor.cells.length <= MIN_PIECE_LEN) continue;
        const tail = donor.cells[donor.cells.length - 1];
        if (Math.abs(tail.row - cell.row) + Math.abs(tail.col - cell.col) !== 1) continue;
        const trial = renumber(
          current.map((p) =>
            p.id === donor.id
              ? { ...p, cells: p.cells.slice(0, -1) }
              : p.id === single.id
                ? { ...p, cells: [...p.cells, tail] }
                : p
          )
        );
        if (verifySolvable(trial, cols, rows)) {
          folded = trial;
          break;
        }
      }
    }
    if (!folded) break; // this single can't be placed; leave it and stop
    current = folded;
  }
  return current;
}

/**
 * How good a finished board is, lower being better, or null if it is not
 * usable at all. The score is its number of 1-cell pieces.
 *
 * Solvability is the only hard requirement, and it is checked by simulating
 * the board to completion rather than trusted from the construction order.
 * A stray 1-cell piece is a blemish, not a fault: rejecting boards outright
 * for having one used to throw away 200 of every 203 attempts once pieces
 * got longer (longer pieces strand more odd cells), which burned through
 * every retry and dropped good boards for a far worse fallback.
 */
function boardScore(pieces: Piece[] | null, cols: number, rows: number): number | null {
  if (!pieces || !verifySolvable(pieces, cols, rows)) return null;
  return pieces.filter((p) => p.cells.length < MIN_PIECE_LEN).length;
}

/**
 * A board that is correct by inspection: one piece per row, spanning the
 * full width, each leaving by the near end. Every piece's lane runs off the
 * board immediately, so all of them are clearable from the first move and
 * the board cannot deadlock.
 *
 * This is a floor, not a puzzle, and in testing nothing reaches it — it
 * exists so that "no acceptable board" can never mean "hand the player a
 * board they cannot finish".
 */
function fallbackBoard(cols: number, rows: number): Piece[] {
  return Array.from({ length: rows }, (_, row) => {
    const leftward = row % 2 === 0;
    const cells: Coord[] = Array.from({ length: cols }, (_, i) => ({ row, col: leftward ? i : cols - 1 - i }));
    return { id: row, cells, direction: leftward ? "left" : ("right" as Direction) };
  });
}

export function generatePuzzleForLevel(level: number, seed: number): Puzzle {
  const { cols, rows } = gridForLevel(level);
  const complexity = COMPLEXITY_BY_TIER[tierForLevel(level)];

  let best: Piece[] | null = null;
  let bestScore = Infinity;
  const consider = (candidate: Piece[] | null): boolean => {
    const score = boardScore(candidate, cols, rows);
    if (score === null) return false;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
    return bestScore === 0; // nothing left to improve
  };

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const built = buildPieces(cols, rows, mulberry32(seed + attempt * 104729), complexity);
    if (consider(built && absorbSingles(built, cols, rows))) break;
  }

  // Long chained pieces are what make a board interesting and also what makes
  // it hard to lay out. If the tier's settings never produced a usable board
  // for this seed, a tamer one almost always will — a plainer puzzle beats a
  // broken one.
  if (best === null) {
    const relaxed: Complexity = { ...complexity, dependencyBias: 0, minLen: 2, maxLen: Math.min(complexity.maxLen, 5) };
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const built = buildPieces(cols, rows, mulberry32(seed + 7919 + attempt * 104729), relaxed);
      if (consider(built && absorbSingles(built, cols, rows))) break;
    }
  }

  return {
    id: `level-${level}-${seed}`,
    level,
    cols,
    rows,
    pieces: best ?? fallbackBoard(cols, rows),
    tier: tierForLevel(level),
    seed,
  };
}


