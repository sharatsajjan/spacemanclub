import { hashStringToSeed } from "./rng";
import { generatePuzzle } from "./generator";
import { Puzzle } from "./types";

export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Daily puzzles sit at a friendly-but-real difficulty, nudged slightly by day of week. */
export function difficultyForDate(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const weekendBoost = day === 0 || day === 6 ? 2 : 0;
  return 5 + weekendBoost;
}

export function generateDailyPuzzle(dateStr: string = todayDateString()): Puzzle {
  const seed = hashStringToSeed(`arrowflow-daily-${dateStr}`);
  const difficulty = difficultyForDate(dateStr);
  return { ...generatePuzzle({ mode: "daily", difficulty, seed }), id: `daily-${dateStr}` };
}
