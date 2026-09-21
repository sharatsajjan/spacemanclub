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
}
