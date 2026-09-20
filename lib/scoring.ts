import { GameMode } from "./types";

export function baseScoreForDifficulty(difficulty: number, size: number): number {
  return 120 + difficulty * 35 + size * 10;
}

export function starsForResult(parMoves: number, playerMoves: number, hintsUsed: number): 1 | 2 | 3 {
  if (hintsUsed === 0 && playerMoves <= parMoves) return 3;
  if (hintsUsed <= 1 && playerMoves <= Math.ceil(parMoves * 1.35)) return 2;
  return 1;
}

export interface ScoreInput {
  mode: GameMode;
  difficulty: number;
  size: number;
  parMoves: number;
  playerMoves: number;
  elapsedMs: number;
  hintsUsed: number;
}

export interface ScoreOutput {
  score: number;
  stars: 1 | 2 | 3;
  xpGained: number;
}

/** Rough "should be doable in" time, used only to compute a speed bonus — not a fail timer. */
function expectedSeconds(size: number): number {
  return 18 + size * 9;
}

export function computeScore(input: ScoreInput): ScoreOutput {
  const { difficulty, size, parMoves, playerMoves, elapsedMs, hintsUsed, mode } = input;
  const base = baseScoreForDifficulty(difficulty, size);
  const efficiency = Math.min(1, parMoves / Math.max(parMoves, playerMoves));

  const elapsedSeconds = elapsedMs / 1000;
  const expected = expectedSeconds(size);
  const speedFactor = Math.max(0, Math.min(1, (expected - elapsedSeconds) / expected));
  const speedBonus = Math.round(base * 0.4 * speedFactor);

  const hintPenalty = hintsUsed * Math.round(base * 0.12);

  const modeMultiplier = mode === "challenge" ? 1.25 : mode === "daily" ? 1.1 : 1;

  const rawScore = Math.round(base * efficiency + speedBonus - hintPenalty);
  const score = Math.max(10, Math.round(rawScore * modeMultiplier));

  const stars = starsForResult(parMoves, playerMoves, hintsUsed);
  const xpGained = Math.round(score * 0.5 + stars * 15);

  return { score, stars, xpGained };
}

export function xpForLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.35));
}

export function levelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNext: xpForLevel(level) };
}
