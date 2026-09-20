import { PlayerProfile, PuzzleResult } from "./types";
import { levelFromXp } from "./scoring";
import { ACHIEVEMENTS, newlyUnlocked } from "./achievements";
import { todayDateString } from "./dailySeed";

const PROFILE_KEY = "arrowflow.profile.v1";

export function defaultProfile(): PlayerProfile {
  return {
    xp: 0,
    level: 1,
    dailyStreak: 0,
    lastDailyCompletedDate: null,
    endlessLevel: 1,
    endlessHighScore: 0,
    challengeHighScore: 0,
    totalPuzzlesSolved: 0,
    totalStars: 0,
    threeStarClears: 0,
    achievements: [],
    playerName: "Player",
  };
}

export function loadProfile(): PlayerProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    return { ...defaultProfile(), ...parsed };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable (private mode, quota) — fail silently, game still playable
  }
}

export function isDailyCompletedToday(profile: PlayerProfile): boolean {
  return profile.lastDailyCompletedDate === todayDateString();
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export interface ApplyResultOutcome {
  profile: PlayerProfile;
  leveledUp: boolean;
  newLevel: number;
  unlockedAchievements: typeof ACHIEVEMENTS;
  streakContinued: boolean;
}

/** Folds a finished puzzle's result into the persisted profile: XP, streaks, high scores, achievements. */
export function applyResult(profile: PlayerProfile, result: PuzzleResult): ApplyResultOutcome {
  const before = profile;
  const next: PlayerProfile = { ...profile };

  next.xp += result.xpGained;
  next.totalPuzzlesSolved += 1;
  next.totalStars += result.stars;
  if (result.stars === 3) next.threeStarClears += 1;

  const { level } = levelFromXp(next.xp);
  const leveledUp = level > before.level;
  next.level = level;

  let streakContinued = false;
  if (result.mode === "daily") {
    const today = todayDateString();
    if (next.lastDailyCompletedDate !== today) {
      if (next.lastDailyCompletedDate && daysBetween(next.lastDailyCompletedDate, today) === 1) {
        next.dailyStreak += 1;
        streakContinued = true;
      } else {
        next.dailyStreak = 1;
      }
      next.lastDailyCompletedDate = today;
    }
  }

  if (result.mode === "endless") {
    next.endlessHighScore = Math.max(next.endlessHighScore, result.score);
  }

  const unlocked = newlyUnlocked(before, next);
  if (unlocked.length > 0) {
    next.achievements = [...next.achievements, ...unlocked.map((a) => a.id)];
  }

  saveProfile(next);

  return {
    profile: next,
    leveledUp,
    newLevel: next.level,
    unlockedAchievements: unlocked,
    streakContinued,
  };
}

export function bumpEndlessLevel(profile: PlayerProfile): PlayerProfile {
  const next = { ...profile, endlessLevel: profile.endlessLevel + 1 };
  saveProfile(next);
  return next;
}

export function resetEndlessProgress(profile: PlayerProfile): PlayerProfile {
  const next = { ...profile, endlessLevel: 1 };
  saveProfile(next);
  return next;
}

/** A challenge run's total score (summed across every puzzle solved in the run) vs. per-puzzle score. */
export function recordChallengeRun(profile: PlayerProfile, totalScore: number): PlayerProfile {
  const next = { ...profile, challengeHighScore: Math.max(profile.challengeHighScore, totalScore) };
  saveProfile(next);
  return next;
}
