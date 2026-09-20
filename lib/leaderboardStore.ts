import { promises as fs } from "fs";
import path from "path";

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "leaderboard.json");
const MAX_ENTRIES = 100;

// Note: on a serverless/read-only deployment (e.g. Vercel) writes here only
// persist for the life of the function instance. Swap this module for a
// real database-backed store if you need durable global leaderboards.

async function readEntries(): Promise<LeaderboardEntry[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries: LeaderboardEntry[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export async function getTopEntries(limit = 20): Promise<LeaderboardEntry[]> {
  const entries = await readEntries();
  return entries
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function addEntry(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  const entries = await readEntries();
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  await writeEntries(trimmed);
  return trimmed;
}
