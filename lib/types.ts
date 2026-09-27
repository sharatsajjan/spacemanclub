export type Direction = "up" | "down" | "left" | "right";

export interface Coord {
  row: number;
  col: number;
}

export type DifficultyTier = "Easy" | "Medium" | "Hard" | "Hardest";

/**
 * A piece: a connected, bent path of one or more cells, with `cells[0]` the
 * HEAD — where the arrowhead is drawn and the end the piece leaves by.
 *
 * A piece does not slide rigidly. It threads out head first, each segment
 * following into the cell the one ahead has just vacated, so the only ground
 * it covers that it does not already occupy is the straight lane from its
 * head to the edge in `direction`. That lane has to be clear of other
 * pieces — and of the piece's own body, since the body follows the head
 * rather than moving aside. See `pieceCanExit` in lib/rules.ts, which is the
 * single definition of legality, used by the game and the generator alike.
 *
 * `id` is always the piece's own index in `Puzzle.pieces`. The solver and
 * the renderer both index by it, so anything that reorders pieces has to
 * renumber them.
 */
export interface Piece {
  id: number;
  cells: Coord[];
  direction: Direction;
}

export interface Puzzle {
  id: string;
  level: number;
  cols: number;
  rows: number;
  pieces: Piece[];
  tier: DifficultyTier;
  seed: number;
  /** Which cells of the cols x rows grid are part of the board. A board is
   * cut to a silhouette — a mushroom, a heart — rather than filling the
   * rectangle, so cells outside it hold no piece, are never drawn, and count
   * as open ground for a piece sliding past. Row-major, `mask[row][col]`. */
  mask: boolean[][];
}

export interface LevelResult {
  level: number;
  completed: boolean;
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  stars: 1 | 2 | 3;
  coinsEarned: number;
  /** The picture uncovered by finishing this level, if the board was big
   * enough to hide one. */
  pictureId?: string;
}

export type ThemeId = "linen" | "slate" | "sage" | "dusk" | "ocean" | "sepia";

export interface PlayerProfile {
  currentLevel: number;
  bestLevelReached: number;
  coins: number;
  totalStars: number;
  totalLevelsCompleted: number;
  lives: number;
  /** Epoch ms when the next life finishes refilling; null when lives are full. */
  nextLifeAt: number | null;
  theme: ThemeId;
  playerName: string;
  /** Ids of pictures uncovered by finishing a level, in the order first found. */
  collectedPictures: string[];
  /** Whether this profile has already been moved off a superseded default
   * theme. Without it the move would repeat on every load, and a player who
   * deliberately picked the old default would have it taken away again each
   * time. See loadProfile. */
  themeDefaultMigrated?: boolean;
}
