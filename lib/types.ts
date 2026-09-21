export type Direction = "up" | "down" | "left" | "right";

export interface Coord {
  row: number;
  col: number;
}

export type DifficultyTier = "Easy" | "Medium" | "Hard" | "Hardest";

/**
 * Every cell holds one arrow piece. Tapping a piece clears it (removes it
 * from the board) only if its straight-line path in `directions[r][c]`, out
 * to the board edge, is free of every other still-present piece.
 */
export interface Puzzle {
  id: string;
  level: number;
  cols: number;
  rows: number;
  directions: Direction[][];
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
