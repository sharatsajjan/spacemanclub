import { DifficultyTier } from "./types";

const TIER_BASE_COINS: Record<DifficultyTier, number> = {
  Easy: 60,
  Medium: 100,
  Hard: 150,
  Hardest: 220,
};

export interface LevelScoreInput {
  tier: DifficultyTier;
  mistakes: number;
  hintsUsed: number;
  pieceCount: number;
}

export interface LevelScoreOutput {
  stars: 1 | 2 | 3;
  coinsEarned: number;
}

export function starsForLevel(mistakes: number, hintsUsed: number): 1 | 2 | 3 {
  if (mistakes === 0 && hintsUsed === 0) return 3;
  if (mistakes <= 2 && hintsUsed <= 1) return 2;
  return 1;
}

export function computeLevelScore({ tier, mistakes, hintsUsed, pieceCount }: LevelScoreInput): LevelScoreOutput {
  const stars = starsForLevel(mistakes, hintsUsed);
  const base = TIER_BASE_COINS[tier] + Math.round(pieceCount * 0.6);
  const penalty = mistakes * 8 + hintsUsed * 12;
  const coinsEarned = Math.max(10, Math.round(base - penalty));
  return { stars, coinsEarned };
}
