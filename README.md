# ArrowFlow

A calm, single-tone maze puzzle: each level's grid is filled edge-to-edge
with several separate pre-drawn lines, each connecting two dots. Drag from a
line's arrowed start dot to its matching end dot to clear it — no branching
choices, just tracing what's already there. Clear every line to finish the
level. Built with Next.js (App Router) + TypeScript + Tailwind.

## How a level works

- The whole grid is a **Hamiltonian path** (visits every cell once), cut into
  several disjoint pieces — each piece is one draggable line with its own
  start/end dot.
- Dragging onto a cell that isn't the correct next step in the *currently
  active* line costs one of 3 lives and resets that line's progress; lives
  refill over time or via a "watch an ad" bonus.
- Difficulty follows a repeating wave, not a straight ramp: every 5 levels
  cycles Easy → Medium → Medium → Hard → Hardest, each cycle's floor and
  ceiling a little higher than the last, plateauing at a max rather than
  growing forever — built to sustain levels up to 1,000+.
- 5 selectable color themes (Linen, Slate Night, Sage, Dusk, Ocean), all
  single-tone — no rainbow-per-line, applied via CSS variables so switching
  is instant.

Progress (level, coins, stars, lives, chosen theme) is stored in
`localStorage` per device via `lib/storage.ts`.

## Game engine

- `lib/mazeGenerator.ts` — builds the full-coverage Hamiltonian path
  (Warnsdorff-biased backtracking DFS, reliable even on large grids) and
  cuts it into the level's lines.
- `lib/difficultyWave.ts` — the Easy/Medium/Medium/Hard/Hardest wave curve:
  grid size, line count, and hint budget per level.
- `lib/rules.ts` — drag legality: since each line's path is fixed, a step is
  just "does this cell match the next/previous step in the active line".
- `lib/scoring.ts` — stars + coins from mistakes/hints used.
- `hooks/useMazeGame.ts` — owns per-line progress, the active drag, mistakes,
  and hints for one puzzle.
- `components/MazeCanvas.tsx` — the drag-interactive renderer (pointer
  events, not click-to-select).

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.
