import { mulberry32 } from "./rng";

/**
 * A small pixel image hidden under a board. Clearing a piece uncovers
 * whatever sits beneath its cells, so finishing a level leaves a picture
 * behind — the board is a scratch card, not just a grid to empty.
 *
 * `rows` is row-major, one character per pixel, `.` meaning nothing is
 * hidden there (that cell just empties to the board background). Every
 * other character indexes `palette`.
 */
export interface Picture {
  id: string;
  name: string;
  rows: string[];
  palette: Record<string, string>;
}

/**
 * Master switch for the hidden-picture feature: the reveal under the
 * board, the picture on the completion screen, and the gallery. Off means
 * boards empty to plain background and nothing is collected — the sprites
 * and all the wiring stay put, so flipping this back on restores the
 * feature with no other change. Profiles keep any pictures already
 * collected while it is off.
 */
export const PICTURES_ENABLED = false;

export const PICTURE_WIDTH = 9;
export const PICTURE_HEIGHT = 9;

const RED = "#d6453f";
const GREEN = "#5c9e4a";
const DARK_GREEN = "#3f7a34";
const STEM = "#8a5a2f";
const BLUE = "#3f7fbf";
const WHITE = "#f2f6f8";
const INK = "#2b3440";
const YELLOW = "#f0c04a";
const ORANGE = "#e08b3a";
const PINK = "#e07a9e";
const CREAM = "#f5efe2";

/** All authored at 9x9 — small enough to sit inside the play area from the
 * early levels on, big enough to still read as something once uncovered. */
export const PICTURES: Picture[] = [
  {
    id: "heart",
    name: "Heart",
    palette: { R: RED },
    rows: [
      ".RR...RR.",
      "RRRRRRRRR",
      "RRRRRRRRR",
      "RRRRRRRRR",
      ".RRRRRRR.",
      ".RRRRRRR.",
      "..RRRRR..",
      "...RRR...",
      "....R....",
    ],
  },
  {
    id: "cherry",
    name: "Cherry",
    palette: { R: RED, G: GREEN, S: STEM },
    rows: [
      ".......GG",
      "......GG.",
      ".....S...",
      "....S....",
      "...S.S...",
      "..S...S..",
      ".RRR.RRR.",
      ".RRR.RRR.",
      "..R...R..",
    ],
  },
  {
    id: "leaf",
    name: "Leaf",
    palette: { G: GREEN, g: DARK_GREEN },
    rows: [
      "......GGG",
      "....GGGGG",
      "...GGGGGG",
      "..GGgGGGG",
      ".GGGgGGGG",
      "GGGGgGGG.",
      "GGGgGGG..",
      ".GgGGG...",
      "g........",
    ],
  },
  {
    id: "fish",
    name: "Fish",
    palette: { B: BLUE, K: INK },
    rows: [
      ".........",
      "...BBBB..",
      "..BBBBBB.",
      "B.BBBBBBB",
      "BBBBBBKBB",
      "B.BBBBBBB",
      "..BBBBBB.",
      "...BBBB..",
      ".........",
    ],
  },
  {
    id: "chick",
    name: "Chick",
    palette: { Y: YELLOW, O: ORANGE, K: INK },
    rows: [
      ".........",
      "..YYYYY..",
      ".YYYYYYY.",
      ".YYKYYKY.",
      ".YYYYYYY.",
      ".YYYOYYY.",
      ".YYYYYYY.",
      "..YYYYY..",
      "...O.O...",
    ],
  },
  {
    id: "flower",
    name: "Flower",
    palette: { P: PINK, Y: YELLOW, G: GREEN },
    rows: [
      "...PPP...",
      "..PPPPP..",
      ".PPPYPPP.",
      "..PPPPP..",
      "...PPP...",
      "....G....",
      "...GGG...",
      "....G....",
      "....G....",
    ],
  },
  {
    id: "mushroom",
    name: "Mushroom",
    palette: { R: RED, C: CREAM },
    rows: [
      "..RRRRR..",
      ".RRCRRCR.",
      "RRRRRRRRR",
      "RRCRRRCRR",
      "RRRRRRRRR",
      "...CCC...",
      "...CCC...",
      "..CCCCC..",
      ".........",
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    palette: { W: WHITE },
    rows: [
      ".........",
      "....WWW..",
      "..WWWWWWW",
      ".WWWWWWWW",
      "WWWWWWWWW",
      ".WWWWWWW.",
      ".........",
      ".........",
      ".........",
    ],
  },
];

export function getPicture(id: string): Picture | undefined {
  return PICTURES.find((p) => p.id === id);
}

/** Which picture a level hides. Stable for a given level. */
export function pictureForLevel(level: number): Picture {
  const roll = mulberry32(level * 7919 + 13)();
  return PICTURES[Math.min(PICTURES.length - 1, Math.floor(roll * PICTURES.length))];
}

/**
 * Colors for every cell of a `cols` x `rows` board with the picture
 * centered, or null where nothing is hidden. Returns null outright when the
 * board is too small to hold the picture — the first couple of levels are
 * only a few cells across, and a cropped picture reads as a glitch rather
 * than a reward.
 */
export function pictureLayerFor(level: number, cols: number, rows: number): (string | null)[][] | null {
  if (!PICTURES_ENABLED) return null;
  if (cols < PICTURE_WIDTH || rows < PICTURE_HEIGHT) return null;
  const picture = pictureForLevel(level);
  const offsetCol = Math.floor((cols - PICTURE_WIDTH) / 2);
  const offsetRow = Math.floor((rows - PICTURE_HEIGHT) / 2);

  const layer: (string | null)[][] = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (let r = 0; r < PICTURE_HEIGHT; r++) {
    for (let c = 0; c < PICTURE_WIDTH; c++) {
      const key = picture.rows[r][c];
      if (key === ".") continue;
      const color = picture.palette[key];
      if (color) layer[offsetRow + r][offsetCol + c] = color;
    }
  }
  return layer;
}
