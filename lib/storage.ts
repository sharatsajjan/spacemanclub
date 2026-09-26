import { LevelResult, PlayerProfile } from "./types";
import { DEFAULT_THEME, SUPERSEDED_DEFAULT_THEME } from "./themes";

const PROFILE_KEY = "arrowflow.profile.v2";
export const MAX_LIVES = 3;
export const LIFE_REFILL_MS = 15 * 60 * 1000;

export function defaultProfile(): PlayerProfile {
  return {
    currentLevel: 1,
    bestLevelReached: 1,
    coins: 0,
    totalStars: 0,
    totalLevelsCompleted: 0,
    lives: MAX_LIVES,
    nextLifeAt: null,
    theme: DEFAULT_THEME,
    playerName: "Player",
    collectedPictures: [],
    themeDefaultMigrated: true,
  };
}

/** Recomputes lives against the current time — refills one life per LIFE_REFILL_MS elapsed. */
export function refillLives(profile: PlayerProfile): PlayerProfile {
  if (profile.lives >= MAX_LIVES || profile.nextLifeAt === null) return profile;
  let lives = profile.lives;
  let nextLifeAt: number | null = profile.nextLifeAt;
  const now = Date.now();
  while (nextLifeAt !== null && now >= nextLifeAt && lives < MAX_LIVES) {
    lives += 1;
    nextLifeAt = lives < MAX_LIVES ? nextLifeAt + LIFE_REFILL_MS : null;
  }
  if (lives === profile.lives && nextLifeAt === profile.nextLifeAt) return profile;
  return { ...profile, lives, nextLifeAt };
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
    const profile = refillLives({ ...defaultProfile(), ...parsed });
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

/** Loses one life; starts the refill timer if this is the first life lost since full. */
export function loseLife(profile: PlayerProfile): PlayerProfile {
  const refreshed = refillLives(profile);
  if (refreshed.lives <= 0) return refreshed;
  const lives = refreshed.lives - 1;
  const nextLifeAt = refreshed.nextLifeAt ?? Date.now() + LIFE_REFILL_MS;
  const next = { ...refreshed, lives, nextLifeAt };
  saveProfile(next);
  return next;
}

export function grantLifeFromAd(profile: PlayerProfile): PlayerProfile {
  const refreshed = refillLives(profile);
  const lives = Math.min(MAX_LIVES, refreshed.lives + 1);
  const nextLifeAt = lives >= MAX_LIVES ? null : refreshed.nextLifeAt;
  const next = { ...refreshed, lives, nextLifeAt };
  saveProfile(next);
  return next;
}

export interface ApplyLevelOutcome {
  profile: PlayerProfile;
  isNewBest: boolean;
  /** True when this level's picture had never been uncovered before. */
  isNewPicture: boolean;
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

  saveProfile(next);
  return { profile: next, isNewBest, isNewPicture };
}

export function setTheme(profile: PlayerProfile, theme: PlayerProfile["theme"]): PlayerProfile {
  const next = { ...profile, theme };
  saveProfile(next);
  return next;
}
