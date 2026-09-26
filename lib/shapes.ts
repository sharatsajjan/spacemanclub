import { gridForLevel } from "./difficultyWave";

/**
 * The silhouette a board is cut to.
 *
 * Boards in this genre are not always rectangles — the successful ones cut
 * the puzzle to a shape, so a level reads as a rocket or a heart rather than
 * a block of arrows. The shape is purely a mask over the grid: cells outside
 * it hold no piece and are never drawn, and a piece sliding out passes
 * through that space as if it were off the edge.
 *
 * A shape is geometry, not pixels: `inside(x, y)` answers whether a point is
 * within the silhouette, in a box `aspect` wide and 1 tall centred on the
 * origin, with y pointing down. Defining them this way means one definition
 * serves a 10-cell board and a 550-cell one, and the outline is as clean as
 * the grid allows at both — a shape drawn as a small character grid and
 * scaled up carries its own staircase into every board built from it.
 *
 * `aspect` is the shape's own width:height. A board is only cut to a shape
 * whose aspect the grid can roughly match (see `layoutForLevel`), because a
 * heart squeezed into a grid twice as tall as it is wide is just a smear.
 */
export interface BoardShape {
  id: string;
  name: string;
  /** "tall" fits any board; "square" only fits the small ones; "rect" fits
   * anything, having no proportions of its own. */
  family: "rect" | "tall" | "square";
  aspect: number;
  inside(x: number, y: number): boolean;
}

type Region = (x: number, y: number) => boolean;

const box = (x0: number, y0: number, x1: number, y1: number): Region => (x, y) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

const disc = (cx: number, cy: number, r: number): Region => (x, y) =>
  (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;

const ellipse = (cx: number, cy: number, rx: number, ry: number): Region => (x, y) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** A trapezoid: a horizontal band, `topHalf` wide at `yTop` and `botHalf`
 * wide at `yBot`, the sides straight between them. Most of these shapes are
 * built out of these — a tree's tiers, a bell's flare, a bottle's shoulder. */
const taper = (yTop: number, topHalf: number, yBot: number, botHalf: number): Region => (x, y) => {
  if (y < yTop || y > yBot) return false;
  const t = (y - yTop) / (yBot - yTop);
  return Math.abs(x) <= topHalf + (botHalf - topHalf) * t;
};

/** A triangle, by its three corners. */
const tri =
  (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Region =>
  (x, y) => {
    const side = (px: number, py: number, qx: number, qy: number) =>
      (qx - px) * (y - py) - (qy - py) * (x - px);
    const s1 = side(ax, ay, bx, by);
    const s2 = side(bx, by, cx, cy);
    const s3 = side(cx, cy, ax, ay);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  };

const any =
  (...regions: Region[]): Region =>
  (x, y) =>
    regions.some((region) => region(x, y));

const without =
  (base: Region, ...holes: Region[]): Region =>
  (x, y) =>
    base(x, y) && !holes.some((hole) => hole(x, y));

export const SHAPES: BoardShape[] = [
  {
    // The plain rectangle, still in the rotation: a shaped board every
    // single level would stop being a change of pace. It is the one shape
    // with no proportions of its own, so it takes whatever grid the level's
    // size asks for.
    id: "rect",
    name: "Board",
    family: "rect",
    aspect: 1,
    inside: () => true,
  },

  // ---- Tall shapes: drawn at roughly the proportions of a phone held
  // upright, so they still fit the largest boards the game builds.
  {
    id: "tree",
    name: "Tree",
    family: "tall",
    aspect: 0.58,
    inside: any(
      taper(-0.5, 0.05, -0.26, 0.15),
      taper(-0.3, 0.05, -0.06, 0.21),
      taper(-0.1, 0.08, 0.16, 0.29),
      box(-0.08, 0.14, 0.08, 0.44),
      taper(0.38, 0.08, 0.5, 0.16)
    ),
  },
  {
    id: "rocket",
    name: "Rocket",
    family: "tall",
    aspect: 0.52,
    inside: any(
      // Nose, then a body that swells slightly towards the base.
      ellipse(0, -0.26, 0.11, 0.24),
      taper(-0.26, 0.11, 0.3, 0.13),
      // Fins, standing a couple of cells clear of the body on each side and
      // meeting it only at the base, so the outline reads as a rocket rather
      // than a tower.
      tri(-0.18, 0.06, -0.26, 0.36, -0.18, 0.36),
      tri(0.18, 0.06, 0.26, 0.36, 0.18, 0.36),
      box(-0.26, 0.3, 0.26, 0.36),
      // Exhaust.
      taper(0.36, 0.1, 0.5, 0.06)
    ),
  },
  {
    id: "bottle",
    name: "Bottle",
    family: "tall",
    aspect: 0.5,
    inside: any(
      box(-0.09, -0.5, 0.09, -0.26),
      taper(-0.26, 0.09, -0.12, 0.26),
      box(-0.26, -0.14, 0.26, 0.38),
      ellipse(0, 0.38, 0.26, 0.12)
    ),
  },
  {
    id: "cactus",
    name: "Cactus",
    family: "tall",
    aspect: 0.6,
    inside: any(
      // Trunk, capped round at the top.
      box(-0.11, -0.4, 0.11, 0.42),
      disc(0, -0.4, 0.11),
      // Two arms at different heights, each an elbow: up the side, then in.
      box(-0.29, -0.2, -0.19, 0.06),
      disc(-0.24, -0.2, 0.05),
      box(-0.29, 0.02, -0.11, 0.1),
      box(0.19, -0.08, 0.29, 0.14),
      disc(0.24, -0.08, 0.05),
      box(0.11, 0.1, 0.29, 0.18),
      // A pot to stand in.
      taper(0.42, 0.2, 0.5, 0.15)
    ),
  },
  {
    id: "bulb",
    name: "Bulb",
    family: "tall",
    aspect: 0.55,
    inside: any(
      disc(0, -0.22, 0.27),
      taper(-0.02, 0.27, 0.12, 0.13),
      // The screw base, ridged.
      box(-0.13, 0.12, 0.13, 0.5),
      box(-0.16, 0.16, 0.16, 0.22),
      box(-0.16, 0.28, 0.16, 0.34)
    ),
  },
  {
    id: "arrow",
    name: "Arrow",
    family: "tall",
    aspect: 0.56,
    // Head over the top half, shaft down the bottom. The head has to reach
    // the full width exactly at the shoulder — widening past it only clips
    // against the edge of the box, which reads as a cross, not an arrow.
    inside: any(taper(-0.5, 0.05, 0.0, 0.28), box(-0.12, 0.0, 0.12, 0.5)),
  },
  {
    id: "pencil",
    name: "Pencil",
    family: "tall",
    aspect: 0.46,
    inside: any(
      taper(-0.5, 0.05, -0.28, 0.23),
      box(-0.23, -0.28, 0.23, 0.34),
      taper(0.34, 0.23, 0.5, 0.19)
    ),
  },
  {
    id: "kite",
    name: "Kite",
    family: "tall",
    aspect: 0.55,
    inside: any(taper(-0.5, 0.05, -0.1, 0.32), taper(-0.1, 0.32, 0.5, 0.05)),
  },

  // ---- Square shapes: only offered while the board is small enough to be
  // cut square without stretching them out of recognition.
  {
    id: "heart",
    name: "Heart",
    family: "square",
    aspect: 1.02,
    // The classic heart curve, (X^2 + Y^2 - 1)^3 <= X^2 Y^3, scaled so its
    // bounding box is exactly the box — which is what makes the cleft at the
    // top and the point at the bottom survive onto a small grid.
    inside: (x, y) => {
      const X = x * 2.238;
      const Y = 0.118 - y * 2.236;
      const t = X * X + Y * Y - 1;
      return t * t * t <= X * X * Y * Y * Y;
    },
  },
  {
    id: "mushroom",
    name: "Mushroom",
    family: "square",
    aspect: 1,
    inside: any(
      without(disc(0, 0.02, 0.5), box(-0.5, 0.02, 0.5, 0.5)),
      box(-0.5, -0.02, 0.5, 0.06),
      box(-0.15, 0.02, 0.15, 0.38),
      taper(0.38, 0.15, 0.5, 0.22)
    ),
  },
  {
    id: "leaf",
    name: "Leaf",
    family: "square",
    aspect: 1.05,
    // Two overlapping circles: the lens between them is a leaf, tip to tip
    // on the diagonal.
    // A lens with pointed tips on the diagonal: the overlap of two circles,
    // written in coordinates turned 45 degrees so the tips land in opposite
    // corners of the box.
    inside: (x, y) => {
      const along = (x - y) / Math.SQRT2;
      const across = (x + y) / Math.SQRT2;
      const tip = 0.66;
      const halfWidth = 0.29;
      const r = (tip * tip + halfWidth * halfWidth) / (2 * halfWidth);
      if (Math.abs(along) > tip) return false;
      return Math.sqrt(r * r - along * along) - (r - halfWidth) >= Math.abs(across);
    },
  },
  {
    id: "cloud",
    name: "Cloud",
    family: "square",
    aspect: 1.4,
    inside: any(
      disc(-0.4, 0.04, 0.24),
      disc(-0.08, -0.14, 0.32),
      disc(0.34, -0.02, 0.26),
      box(-0.68, 0.0, 0.66, 0.32),
      ellipse(0, 0.32, 0.68, 0.18)
    ),
  },
  {
    id: "bell",
    name: "Bell",
    family: "square",
    aspect: 1.1,
    inside: any(
      disc(0, -0.2, 0.3),
      taper(-0.2, 0.3, 0.28, 0.46),
      box(-0.55, 0.28, 0.55, 0.4),
      box(-0.16, 0.4, 0.16, 0.5)
    ),
  },
  {
    id: "diamond",
    name: "Diamond",
    family: "square",
    aspect: 1,
    // A rounded diamond rather than a straight one: four needle points each
    // leave a one-cell pocket, and a one-cell piece is a free move.
    inside: (x, y) => (Math.abs(x) / 0.5) ** 1.35 + (Math.abs(y) / 0.5) ** 1.35 <= 1,
  },
];

/**
 * How far off its own proportions a shape may be stretched before it stops
 * reading as itself. A heart cut into a grid twice as tall as it is wide is
 * just a tall smear, so a shape that cannot be fitted within this much
 * distortion at a level's board size is simply not offered at that level.
 */
const MAX_DISTORTION = 1.22;

/** Samples per cell per axis when deciding whether a cell is inside the
 * shape. A cell is in if over half its area is. */
const SAMPLES = 4;

export interface BoardLayout {
  shape: BoardShape;
  cols: number;
  rows: number;
  mask: boolean[][];
}

/**
 * The fraction of a grid a shape keeps, measured once per shape.
 *
 * Used to size the grid up so a shaped level holds about as many pieces as a
 * rectangular one at the same difficulty — a level shaped like a tree should
 * be a tree, not a rest.
 */
const fillCache = new Map<string, number>();
function fillOf(shape: BoardShape): number {
  const cached = fillCache.get(shape.id);
  if (cached !== undefined) return cached;
  const N = 48;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = (-0.5 + (i + 0.5) / N) * shape.aspect;
      const y = -0.5 + (j + 0.5) / N;
      if (shape.inside(x, y)) hits++;
    }
  }
  const fill = Math.max(0.25, hits / (N * N));
  fillCache.set(shape.id, fill);
  return fill;
}

/** Ceiling on that compensation: past this the cells get too small to hit
 * comfortably, which costs more than the missing pieces are worth. */
const MAX_FILL_COMPENSATION = 1.7;

function gridFor(shape: BoardShape, level: number): { cols: number; rows: number } {
  if (shape.family === "rect") return gridForLevel(level);
  return gridForLevel(level, shape.aspect, Math.min(MAX_FILL_COMPENSATION, 1 / fillOf(shape)));
}

function fitsUndistorted(shape: BoardShape, level: number): boolean {
  if (shape.family === "rect") return true;
  const { cols, rows } = gridFor(shape, level);
  const ratio = cols / rows;
  // The grid is clamped to what fits on a phone, so a large board cannot be
  // made as wide as a square shape would need.
  return Math.max(ratio / shape.aspect, shape.aspect / ratio) <= MAX_DISTORTION;
}

/** The level the square shapes start at — the first three are plain
 * rectangles, so a new player meets the rule before the scenery. */
const FIRST_SHAPED_LEVEL = 4;

/** Square shapes widest first. They drop out of range in that order as the
 * board grows, so taking them in this order over the opening levels gets
 * every one of them played before the board outgrows the family. */
const SQUARE_SHAPES = SHAPES.filter((s) => s.family === "square").sort((a, b) => b.aspect - a.aspect);
const TALL_SHAPES = SHAPES.filter((s) => s.family === "tall");
const RECT = SHAPES[0];

/**
 * The shapes a level could be cut to, given how big its board is.
 *
 * The two families don't mix. While the board is small enough to hold them,
 * the square shapes get that window to themselves — it is the only place
 * they fit, and a run of levels shaped like a cloud, a bell and a heart is a
 * better introduction than the same shapes turning up once each by chance.
 * Once the board outgrows them the tall shapes take over for good. The plain
 * rectangle is in both sets, so it keeps coming round throughout.
 */
export function shapesForLevel(level: number): BoardShape[] {
  const square = SQUARE_SHAPES.filter((s) => fitsUndistorted(s, level));
  return square.length > 0 ? [...SQUARE_SHAPES, RECT] : [RECT, ...TALL_SHAPES];
}

/**
 * The board a level is played on: its shape, the grid sized to that shape,
 * and the mask.
 *
 * The shape is chosen before the grid, because the grid's proportions come
 * from it. Stable for a given level — the same level is always the same
 * shape, even though the maze inside it is freshly generated each time.
 */
function shapeForLevel(level: number): BoardShape {
  // Plain rectangles for the opening levels: the first thing a new player
  // sees should be the simplest reading of the rule.
  if (level < FIRST_SHAPED_LEVEL) return RECT;
  const candidates = shapesForLevel(level);
  // Taken in turn rather than picked at random: a random pick left some
  // shapes never used and others three levels running. A rotation plays
  // every shape, and doesn't come round anywhere near often enough to be
  // noticed from the inside.
  const shape = candidates[(level - FIRST_SHAPED_LEVEL) % candidates.length];
  // A shape the board has outgrown gives way to the plain rectangle rather
  // than being stretched.
  return fitsUndistorted(shape, level) ? shape : RECT;
}

export function layoutForLevel(level: number): BoardLayout {
  const shape = shapeForLevel(level);
  const { cols, rows } = gridFor(shape, level);
  return { shape, cols, rows, mask: maskForShape(shape, cols, rows) };
}

/**
 * Cuts a shape into a cols x rows grid.
 *
 * Any cell left with no neighbour is dropped: an isolated cell can only hold
 * a one-cell piece, which is a free move rather than a puzzle. And a shape
 * that lands on too few cells falls back to the full rectangle — a board
 * that small has no puzzle in it at all.
 */
export function maskForShape(shape: BoardShape, cols: number, rows: number): boolean[][] {
  const width = shape.aspect;
  const mask = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (-0.5 + (c + (sx + 0.5) / SAMPLES) / cols) * width;
          const y = -0.5 + (r + (sy + 0.5) / SAMPLES) / rows;
          if (shape.inside(x, y)) hits++;
        }
      }
      return hits * 2 >= SAMPLES * SAMPLES;
    })
  );

  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r][c]) continue;
      const hasNeighbour =
        (r > 0 && mask[r - 1][c]) ||
        (r < rows - 1 && mask[r + 1][c]) ||
        (c > 0 && mask[r][c - 1]) ||
        (c < cols - 1 && mask[r][c + 1]);
      if (!hasNeighbour) mask[r][c] = false;
      else count++;
    }
  }

  if (count < MIN_SHAPE_CELLS) return Array.from({ length: rows }, () => new Array(cols).fill(true));
  return mask;
}

/** Below this a "shape" is too small to hold a puzzle worth playing. */
const MIN_SHAPE_CELLS = 24;
