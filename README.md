# ArrowFlow

A path-tracing puzzle web app: connect **START** to **END** on a grid where some
tiles carry a fixed arrow that forces which way you must leave them, and some
tiles are blocked. Built with Next.js (App Router) + TypeScript + Tailwind, so
the game logic in `lib/` and `hooks/` can be reused as-is in a React Native
port later.

## Modes

- **Daily** (`/daily`) — one puzzle a day, seeded from the date so everyone
  gets the same grid. Builds a streak.
- **Endless** (`/endless`) — puzzles keep coming, grid size / arrow density /
  obstacles scale up with your level. No fail state.
- **Challenge** (`/challenge`) — a 2-minute timed sprint through
  back-to-back puzzles of rising difficulty; final score can be submitted to
  a shared leaderboard.

Progress (XP, level, streak, endless level, achievements) is stored in
`localStorage` per device via `lib/storage.ts`.

## Game engine

- `lib/generator.ts` — builds each puzzle from a long self-avoiding random
  walk (Warnsdorff-biased backtracking so long paths are found reliably),
  then layers forced-direction arrows and blocked cells onto it. The walk
  itself is always solvable by construction.
- `lib/rules.ts` — movement legality (adjacency, no revisits, forced-arrow
  exits, blocked tiles).
- `lib/solver.ts` — DFS solver used to verify solvability at generation time
  and to power the in-game hint system.
- `lib/scoring.ts` — par-based efficiency + speed bonus + hint penalty →
  score, stars, XP; plus the XP → level curve.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Leaderboard API

`app/api/leaderboard/route.ts` reads/writes `data/leaderboard.json` on disk.
That's fine for local/self-hosted use; on a read-only serverless deploy
(e.g. Vercel) it will only persist for the life of a function instance —
swap `lib/leaderboardStore.ts` for a real database if you need a durable
global leaderboard in production.
