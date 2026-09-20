function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Difficulty is an open-ended integer (endless level, or a fixed rung for daily/challenge). */
export function sizeForDifficulty(d: number): number {
  if (d <= 2) return 5;
  if (d <= 5) return 6;
  if (d <= 9) return 7;
  if (d <= 14) return 8;
  return 9;
}

export function coverageForDifficulty(d: number): number {
  const t = clamp01((d - 1) / 14);
  return 0.55 + t * 0.3;
}

export function forcedProbForDifficulty(d: number): number {
  const t = clamp01((d - 1) / 14);
  return 0.16 + t * 0.44;
}

export function blockedProbForDifficulty(d: number): number {
  const t = clamp01((d - 1) / 14);
  return t * 0.26;
}

export function maxHintsForDifficulty(d: number): number {
  if (d <= 3) return 5;
  if (d <= 8) return 3;
  return 2;
}
