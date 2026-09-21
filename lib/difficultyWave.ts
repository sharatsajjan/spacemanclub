import { DifficultyTier } from "./types";

/**
 * Difficulty as a repeating wave, not a straight ramp: every 5 levels cycles
 * Easy -> Medium -> Medium -> Hard -> Hardest, then eases back to Easy and
 * climbs again — each cycle's floor and ceiling a little higher than the
 * last, plateauing at a max rather than growing forever. This avoids
 * grinding players down with relentless escalation while still giving a
 * long-term sense of progress up to (at least) level 1000.
 */
const CYCLE_LEN = 5;
const TIERS: DifficultyTier[] = ["Easy", "Medium", "Medium", "Hard", "Hardest"];
const TIER_BONUS = [0, 1, 1, 2, 3];
const MAX_SCALE = 22;

export function tierForLevel(level: number): DifficultyTier {
  return TIERS[(level - 1) % CYCLE_LEN];
}

function cycleIndex(level: number): number {
  return Math.floor((level - 1) / CYCLE_LEN);
}

/** Internal difficulty knob driving board size — not a literal piece count. */
function difficultyScaleForLevel(level: number): number {
  const pos = (level - 1) % CYCLE_LEN;
  const cycleBase = 3 + Math.floor(cycleIndex(level) * 0.8);
  return Math.min(MAX_SCALE, cycleBase + TIER_BONUS[pos]);
}

export function gridForLevel(level: number): { cols: number; rows: number } {
  const scale = difficultyScaleForLevel(level);
  const targetCells = Math.round(scale * 9);
  const cols = Math.max(5, Math.min(12, Math.round(Math.sqrt(targetCells * 0.72))));
  const rows = Math.max(6, Math.min(18, Math.round(targetCells / cols)));
  return { cols, rows };
}

export function maxHintsForLevel(level: number): number {
  const tier = tierForLevel(level);
  if (tier === "Easy") return 3;
  if (tier === "Medium") return 2;
  return 1;
}
