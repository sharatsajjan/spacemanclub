export type Direction = "up" | "down" | "left" | "right";

export type CellType = "empty" | "start" | "end" | "blocked";

export interface Coord {
  row: number;
  col: number;
}

export interface CellData {
  row: number;
  col: number;
  type: CellType;
  /** If set, the path must leave this cell travelling in this direction. */
  forcedDir?: Direction;
}

export type GameMode = "daily" | "endless" | "challenge";

export interface Puzzle {
  id: string;
  mode: GameMode;
  size: number;
  cells: CellData[][];
  start: Coord;
  end: Coord;
  /** A known-valid solution, used as "par" for scoring. */
  parPath: Coord[];
  difficulty: number;
  seed: number;
}

export interface PuzzleResult {
  puzzleId: string;
  mode: GameMode;
  completed: boolean;
  path: Coord[];
  parMoves: number;
  playerMoves: number;
  elapsedMs: number;
  hintsUsed: number;
  stars: 0 | 1 | 2 | 3;
  score: number;
  xpGained: number;
}

export interface PlayerProfile {
  xp: number;
  level: number;
  dailyStreak: number;
  lastDailyCompletedDate: string | null;
  endlessLevel: number;
  endlessHighScore: number;
  challengeHighScore: number;
  totalPuzzlesSolved: number;
  totalStars: number;
  threeStarClears: number;
  achievements: string[];
  playerName: string;
}
