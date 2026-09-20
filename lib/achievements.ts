import { PlayerProfile } from "./types";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUnlocked: (p: PlayerProfile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_flight",
    title: "First Flight",
    description: "Solve your first puzzle.",
    icon: "🚀",
    isUnlocked: (p) => p.totalPuzzlesSolved >= 1,
  },
  {
    id: "streak_3",
    title: "On a Roll",
    description: "Reach a 3-day daily streak.",
    icon: "🔥",
    isUnlocked: (p) => p.dailyStreak >= 3,
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Reach a 7-day daily streak.",
    icon: "🗓️",
    isUnlocked: (p) => p.dailyStreak >= 7,
  },
  {
    id: "streak_30",
    title: "Unstoppable",
    description: "Reach a 30-day daily streak.",
    icon: "🏆",
    isUnlocked: (p) => p.dailyStreak >= 30,
  },
  {
    id: "level_5",
    title: "Navigator",
    description: "Reach player level 5.",
    icon: "🧭",
    isUnlocked: (p) => p.level >= 5,
  },
  {
    id: "level_10",
    title: "Pathfinder",
    description: "Reach player level 10.",
    icon: "⭐",
    isUnlocked: (p) => p.level >= 10,
  },
  {
    id: "endless_10",
    title: "Deep Runner",
    description: "Reach level 10 in Endless mode.",
    icon: "♾️",
    isUnlocked: (p) => p.endlessLevel >= 10,
  },
  {
    id: "endless_25",
    title: "Maze Master",
    description: "Reach level 25 in Endless mode.",
    icon: "🌀",
    isUnlocked: (p) => p.endlessLevel >= 25,
  },
  {
    id: "flawless_10",
    title: "Flawless x10",
    description: "Earn 10 three-star clears.",
    icon: "✨",
    isUnlocked: (p) => p.threeStarClears >= 10,
  },
  {
    id: "flawless_50",
    title: "Perfectionist",
    description: "Earn 50 three-star clears.",
    icon: "💎",
    isUnlocked: (p) => p.threeStarClears >= 50,
  },
];

export function newlyUnlocked(before: PlayerProfile, after: PlayerProfile): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !before.achievements.includes(a.id) && a.isUnlocked(after));
}
