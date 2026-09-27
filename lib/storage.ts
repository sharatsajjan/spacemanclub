import { LevelResult, PlayerProfile } from "./types";
import { DEFAULT_THEME, SUPERSEDED_DEFAULT_THEME } from "./themes";

const PROFILE_KEY = "arrowflow.profile.v2";
/** Only for the legacy profile fields below. Lives are per level now, and
 * that number lives with the game (see LIVES_PER_LEVEL in useMazeGame). */
const LEGACY_FULL_LIVES = 3;

export function defaultProfile(): PlayerProfile {
  return {
    currentLevel: 1,
    bestLevelReached: 1,
    coins: 0,
    totalStars: 0,
    totalLevelsCompleted: 0,
    lives: LEGACY_FULL_LIVES,
    nextLifeAt: null,
    theme: DEFAULT_THEME,
    playerName: "Player",
    collectedPictures: [],
    soundEnabled: true,
    themeDefaultMigrated: true,
  };
}

export function loadProfile(): PlayerProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    // Read the flag off the RAW saved object, not the merged profile: a
    // legacy profile has no such key, and merging over defaultProfile would
    // hand it the default's "already done" and skip the move entirely.
    const alreadyMigrated = parsed?.themeDefaultMigrated === true;
    const profile: PlayerProfile = { ...defaultProfile(), ...parsed };
    // Almost nobody opens the theme picker, so a saved theme matching the old
    // default was inherited rather than chosen — and changing DEFAULT_THEME
    // alone would leave every existing player on it forever. Move those
    // forward once; any other saved theme was picked, so leave it.
    //
    // Once only, and recorded: otherwise this runs on every load and a player
    // who goes and picks the old theme on purpose has it taken away again the
    // next time they open the game.
    if (!alreadyMigrated) {
      const migrated: PlayerProfile = {
        ...profile,
        theme: profile.theme === SUPERSEDED_DEFAULT_THEME ? DEFAULT_THEME : profile.theme,
        themeDefaultMigrated: true,
      };
      saveProfile(migrated);
      return migrated;
    }
    return profile;
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

export interface ApplyLevelOutcome {
  profile: PlayerProfile;
  isNewBest: boolean;
  /** True when this level's picture had never been uncovered before. */
  isNewPicture: boolean;
  /** True when this run beat the player's own time for this level. There is
   * no badge for a first attempt — everything is a record then. */
  isBestTime: boolean;
}

/** Folds a completed level's result into the profile: coins, stars, level progression, pictures. */
export function applyLevelResult(profile: PlayerProfile, result: LevelResult): ApplyLevelOutcome {
  const next: PlayerProfile = { ...profile };
  next.coins += result.coinsEarned;
  next.totalStars += result.stars;
  next.totalLevelsCompleted += 1;

  const isNewBest = result.level >= next.bestLevelReached;
  if (isNewBest) next.bestLevelReached = result.level + 1;
  next.currentLevel = Math.max(next.currentLevel, result.level + 1);

  const collected = next.collectedPictures ?? [];
  const isNewPicture = !!result.pictureId && !collected.includes(result.pictureId);
  next.collectedPictures = isNewPicture ? [...collected, result.pictureId!] : collected;

  next.totalPiecesCleared = (next.totalPiecesCleared ?? 0) + result.piecesCleared;
  next.longestStreak = Math.max(next.longestStreak ?? 0, result.bestStreak);

  const bestTimes = { ...(next.bestTimeMsByLevel ?? {}) };
  const previousBest = bestTimes[result.level];
  const isBestTime = previousBest !== undefined && result.elapsedMs < previousBest;
  if (previousBest === undefined || result.elapsedMs < previousBest) {
    bestTimes[result.level] = result.elapsedMs;
  }
  next.bestTimeMsByLevel = bestTimes;

  saveProfile(next);
  return { profile: next, isNewBest, isNewPicture, isBestTime };
}

export function setTheme(profile: PlayerProfile, theme: PlayerProfile["theme"]): PlayerProfile {
  const next = { ...profile, theme };
  saveProfile(next);
  return next;
}
