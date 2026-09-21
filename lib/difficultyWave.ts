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
/**
 * The board size itself is hard-capped at 14x21 (294 cells) by gridForLevel
 * below, once targetCells reaches ~294 (scale ~33) — that's the real
 * ceiling, not this constant. MAX_SCALE just needs to sit safely above it so
 * the scale formula's own clamp never kicks in earlier than the board-size
 * clamp already does.
 */
const MAX_SCALE = 35;

/**
 * The first `RAMP_LEVELS` levels ease in from a tiny board (a handful of
 * pieces) up to the wave's normal floor, instead of dropping a first-time
 * player straight into a real puzzle. Every level still keeps its own tier
 * label (Easy/Medium/.../Hardest) from the cycle below — only the board
 * SIZE for those early levels is scaled down, so e.g. level 5's "Hardest"
 * is a gentle introduction to that tier, not the full density it reaches
 * once the wave repeats in later cycles.
 */
const RAMP_LEVELS = 12;
const RAMP_START_SCALE = 0.6;

export function tierForLevel(level: number): DifficultyTier {
  return TIERS[(level - 1) % CYCLE_LEN];
}

function cycleIndex(level: number): number {
  return Math.floor((level - 1) / CYCLE_LEN);
}

/** Internal difficulty knob driving board size — not a literal piece count. */
function difficultyScaleForLevel(level: number): number {
  const pos = (level - 1) % CYCLE_LEN;
  // Climbs to the board-size ceiling by around level 50 (was ~level 280) —
  // fast enough that a player actually reaches max difficulty in normal
  // play, instead of the game staying easy for the first hundred-plus
  // levels before it matters.
  const cycleBase = 3 + cycleIndex(level) * 2;
  const naturalScale = Math.min(MAX_SCALE, cycleBase + TIER_BONUS[pos]);
  if (level >= RAMP_LEVELS) return naturalScale;
  const rampFrac = level / RAMP_LEVELS;
  return RAMP_START_SCALE + rampFrac * (naturalScale - RAMP_START_SCALE);
}

export function gridForLevel(level: number): { cols: number; rows: number } {
  const scale = difficultyScaleForLevel(level);
  const targetCells = Math.max(6, Math.round(scale * 9));
  const minCols = level < RAMP_LEVELS ? 2 : 5;
  const minRows = level < RAMP_LEVELS ? 2 : 6;
  const cols = Math.max(minCols, Math.min(14, Math.round(Math.sqrt(targetCells * 0.72))));
  const rows = Math.max(minRows, Math.min(21, Math.round(targetCells / cols)));
  return { cols, rows };
}

export function maxHintsForLevel(level: number): number {
  const tier = tierForLevel(level);
  if (tier === "Easy") return 3;
  if (tier === "Medium") return 2;
  return 1;
}
