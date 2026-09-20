export type Direction = "up" | "down" | "left" | "right";

export interface Coord {
  row: number;
  col: number;
}

export type DifficultyTier = "Easy" | "Medium" | "Hard" | "Hardest";

/** One separate draggable line within a maze — an ordered path from its start dot to its end dot. */
export interface MazeLine {
  id: number;
  /** Ordered cells from the start dot (index 0) to the end dot (last index). */
  path: Coord[];
}

export interface Puzzle {
  id: string;
  level: number;
  cols: number;
  rows: number;
  lines: MazeLine[];
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
