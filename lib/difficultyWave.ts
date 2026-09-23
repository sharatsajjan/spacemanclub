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
 * The board size itself is hard-capped at MAX_COLS x MAX_ROWS (760 cells) by
 * gridForLevel below, once targetCells reaches that — that's the real
 * ceiling, not this constant. MAX_SCALE just needs to sit safely above it so
 * the scale formula's own clamp never kicks in earlier than the board-size
 * clamp already does.
 */
const MAX_SCALE = 86;

/** The biggest board the game ever builds, reached around level 120. Bigger
 * than the play area on a phone: past a certain size the board stops
 * shrinking to fit and starts scrolling instead (see MazeGameView), so the
 * ceiling is set by how long a level should take, not by the screen. */
const MAX_COLS = 20;
const MAX_ROWS = 38;

/**
 * Board size climbs in two gears. The first few cycles grow fast, so a new
 * player reaches a board that fills the screen within a dozen levels rather
 * than grinding through near-empty ones. After that it keeps growing, but
 * slowly, taking until around level 120 to reach the ceiling — the late game
 * should still feel like it's getting bigger, without the jump from one
 * level to the next being large enough to notice.
 */
const FAST_CYCLES = 3;
const FAST_STEP = 11;
const SLOW_STEP = 2.1;

function cycleBaseFor(cycle: number): number {
  if (cycle <= FAST_CYCLES) return 9 + cycle * FAST_STEP;
  return 9 + FAST_CYCLES * FAST_STEP + (cycle - FAST_CYCLES) * SLOW_STEP;
}

/**
 * The first `RAMP_LEVELS` levels ease in from a tiny board (a handful of
 * pieces) up to the wave's normal floor, instead of dropping a first-time
 * player straight into a real puzzle. Every level still keeps its own tier
 * label (Easy/Medium/.../Hardest) from the cycle below — only the board
 * SIZE for those early levels is scaled down, so e.g. level 5's "Hardest"
 * is a gentle introduction to that tier, not the full density it reaches
 * once the wave repeats in later cycles.
 */
const RAMP_LEVELS = 4;
const RAMP_START_SCALE = 1.5;

export function tierForLevel(level: number): DifficultyTier {
  return TIERS[(level - 1) % CYCLE_LEN];
}

function cycleIndex(level: number): number {
  return Math.floor((level - 1) / CYCLE_LEN);
}

/** Internal difficulty knob driving board size — not a literal piece count. */
function difficultyScaleForLevel(level: number): number {
  const pos = (level - 1) % CYCLE_LEN;
  const cycleBase = cycleBaseFor(cycleIndex(level));
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
  // 0.52 is the cols:rows ratio the board is aimed at: roughly twice as tall
  // as it is wide, which suits a phone held upright. Once a board outgrows
  // the screen it scrolls vertically, and a tall board scrolls in one
  // direction rather than two — a squarer board of the same cell count would
  // need panning sideways as well.
  const cols = Math.max(minCols, Math.min(MAX_COLS, Math.round(Math.sqrt(targetCells * 0.52))));
  const rows = Math.max(minRows, Math.min(MAX_ROWS, Math.round(targetCells / cols)));
  return { cols, rows };
}

/** Undos are a safety net against a misread board, so they stay constant
 * rather than thinning out on harder tiers the way hints do. */
export function maxUndosForLevel(_level: number): number {
  return 3;
}

export function maxHintsForLevel(level: number): number {
  const tier = tierForLevel(level);
  if (tier === "Easy") return 3;
  if (tier === "Medium") return 2;
  return 1;
}
