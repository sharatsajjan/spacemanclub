export type Direction = "up" | "down" | "left" | "right";

export interface Coord {
  row: number;
  col: number;
}

export type DifficultyTier = "Easy" | "Medium" | "Hard" | "Hardest";

/**
 * A piece occupies a connected, bent path of one or more cells (`cells`,
 * ordered tail-to-head) and slides rigidly in `direction` when tapped. It
 * clears only if every cell in its path from each of its own cells out to
 * the board edge, in `direction`, is free of every OTHER still-present
 * piece — its own cells never block each other since they move together.
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

export type ThemeId = "linen" | "slate" | "sage" | "dusk" | "ocean";

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
}
