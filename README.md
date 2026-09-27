# ArrowFlow

A tap-to-clear arrow puzzle. Each level is a board of interlocking arrow
pieces; tap a piece and it threads its way off the board, head first, if its
path out is clear. Clear every piece to finish the level.

**v1.1** — live at **https://spacemanclub.vercel.app**. Next.js 15 (App Router) +
TypeScript + Tailwind, deployed on Vercel. No backend, no accounts — a
player's progress lives in `localStorage`.

> This README is written for whoever picks the project up next, human or
> agent. The sections that matter most are **Invariants** and **What makes a
> board hard**: both record things that were got wrong at least once and cost
> real time to work out.

## The rule

A piece is a connected, bent line of cells with an arrowhead at one end.
Tapping it is legal when the **straight lane from its arrowhead to the edge
of the board is clear** — clear of other pieces, and of its own body.

The piece does not slide rigidly. It threads out: the head moves along the
lane and each segment behind follows into the cell the one ahead just
vacated. So a coil whose arrowhead points back through its own loop can
never leave, and the generator has to avoid building one.

`lib/rules.ts` holds the single definition of legality (`pieceCanExit`). The
game and the generator both call it. Do not write a second one.

Cells outside the level's silhouette are open ground: a piece threading past
them passes through as if off the edge of the board.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next's ESLint |
| `npm run build` | production build |
| `npm run verify` | generates ~500 boards and checks they are all playable |
| `npm run measure` | reports how hard the generated boards are, by tier |
| `npm run e2e` | browser checks — needs `npm run dev` running |
| `npm run e2e:sound` | checks taps schedule the right notes, and that muting works |
| `npm run e2e:lives` | checks the lives, the queued-piece rule, and the ad floor |
| `npm run e2e:playthrough -- 23` | plays one level to completion in a browser (add a path for screenshots) |

The browser checks use Playwright. Two environment variables:
`BASE_URL` (default `http://localhost:3000`) and `CHROMIUM_PATH`, for images
that ship a browser instead of downloading one.

## Layout

```
app/            routes: / (home) and /play (the game)
components/     MazeCanvas (the board), MazeGameView (frame, zoom, boosters),
                PaperPop (completion burst), BoosterBar, ThemePicker
hooks/          useMazeGame (one puzzle's state), usePlayerProfile
lib/            the whole game engine — see below
scripts/        the checks described above
```

The engine, in the order a level passes through it:

| File | Responsibility |
| --- | --- |
| `difficultyWave.ts` | level → tier, board size, hint and undo budgets |
| `shapes.ts` | the silhouette a level is cut to, and the grid that fits it |
| `mazeGenerator.ts` | builds the pieces, scores candidate boards, picks one |
| `rules.ts` | whether a piece can leave — the only legality check |
| `exitMotion.ts` | timing for the threading slide-out, shared by view and hook |
| `themes.ts` | six palettes as CSS variables; `sepia` is the default |
| `sound.ts` | every sound, synthesised — no audio files |
| `storage.ts` | the player profile in `localStorage`, with migrations |
| `scoring.ts` | stars and coins from mistakes and hints used |

## How a board is built

1. **Difficulty** — `difficultyWave.ts` turns the level number into a tier.
   The wave repeats Easy → Medium → Medium → Hard → Hardest every five
   levels, each cycle a little bigger than the last, plateauing rather than
   growing forever, so level 800 is still playable. Board size climbs in two
   gears: fast for the first few cycles, then slowly to a ceiling around
   level 120.
2. **Shape** — `shapes.ts` picks the silhouette, *then* sizes the grid to it.
   Shapes are geometry (`inside(x, y)` over a box `aspect` wide and 1 tall),
   not character art, so one definition serves a 10-cell board and a 550-cell
   one with a clean outline at both. Two families: square shapes (heart,
   mushroom, cloud…) for the small early boards, tall ones (rocket, tree,
   bottle…) for everything after, because a square shape on a phone-shaped
   grid is a smear. They are taken in rotation, so every shape gets played.
   The grid is also sized up by how much of it the shape throws away, so a
   tree level holds about as many pieces as a rectangle would.
3. **Pieces** — `mazeGenerator.ts` grows them **in clearing order**. Piece 0
   is the first to leave, so its lane must be clear of everything; piece *k*
   may be blocked only by pieces cleared before it. Building this way proves
   the board solvable by construction; the greedy solve in `boardScore` is
   the backstop. Growth uses Warnsdorff's rule (step into the cell with the
   fewest free neighbours), which is what stopped boards stranding lone cells.
4. **Selection** — several boards are generated and the least generous is
   kept. See below.

## Invariants

Break one of these and the game breaks in a way tests elsewhere will not
catch.

1. **`piece.id === index in `Puzzle.pieces``.** The solver and the renderer
   both index by it. Anything that reorders pieces must renumber them
   (`renumber`).
2. **`cells[0]` is the head.** The arrowhead is drawn there and the exit
   check starts there. A piece built tail-first will look right and play
   wrong.
3. **Every cell inside the mask belongs to exactly one piece.** A hole inside
   a silhouette is visible and unclearable.
4. **The starting board is derived from the pieces, not filled in**
   (`makePresentGrid`). Filling the grid marks the space around a silhouette
   as occupied and strands every piece facing it.
5. **A piece's own body blocks its lane.** It follows the head rather than
   moving aside. This was wrong once and produced 85 unclearable coils in
   2,819 pieces.
6. **The board is re-seeded on every page load**, so a level number does not
   reproduce a board. Never write a check that assumes it does — read the
   board from `data-pieces` on the canvas instead.

## What makes a board hard

**The puzzle is monotone: clearing a piece only ever frees cells.** No tap
can be a mistake, no order can be wrong, and there is nothing to plan. All of
the difficulty is in *finding* a legal piece. This is a ceiling on how hard
the game can get, and no amount of generator tuning lifts it — only a real
ordering constraint would (a piece that must leave before another can, a move
budget, locked pieces). Nothing like that exists today.

Within that ceiling, the number that matters is how often the board offers a
move that needs **no reading**: a piece whose arrowhead already sits within a
couple of cells of the edge is visibly free. While one is on offer, nothing
else about the board matters. Boards are now scored on it — generate several,
keep the one that gives away least:

| Tier | Before scoring | Now |
| --- | --- | --- |
| Easy | 79% | 62% |
| Medium | 67% | 42% |
| Hard | 54% | 30% |
| Hardest | 52% | 28% |

One free move at the start is unavoidable: the first piece to leave needs a
clear lane and every cell inside the silhouette holds a piece. Hardest
averages 1.3, against a floor of 1.

`npm run measure` prints this table for the current code. Things that were
tried and **did not** work, so they are not worth retrying blind:

- **Holes in the board** (porosity) made boards *easier* — 87–98% of pieces
  became immediately clearable.
- **Requiring every piece to sweep cleanly** collapsed bends from 11.0 to
  0.15 per piece.
- **Raising the minimum piece length** made boards longer but flatter, and
  cost the short pieces that make a board look tangled. Length is drawn
  bimodally instead: mostly long or mostly short, rarely middling.
- **Ranking blockers by distance** (rather than by which piece was cleared
  last) builds a heap rather than a chain: everything waiting on an early
  piece comes free at the same moment.

## Rendering

`components/MazeCanvas.tsx` draws the board as one SVG over a CSS grid of
tap targets, in this order:

1. **Dots** at cell centres — the lattice the maze sits on, drawn first so
   lines pass *over* it. A cell holding a piece hides its own dot and shows
   it again once the piece leaves.
2. **Halos** — each piece's line drawn thick in the page's background colour,
   all of them before any coloured line, so two pieces running close together
   never read as one. There is no sheet under the board: the maze is drawn
   straight onto the page, which is why halos use `--outer`.
3. **Lines and arrowheads**, one path per piece.

Cells outside the silhouette render as an inert `div`: no tap target, no
label for a screen reader.

The slide-out is a stroke-dash animation measured off the real path, with the
duration scaled to the distance the piece actually travels (`exitMotion.ts`),
so every piece leaves at the same speed. Start it in a `useLayoutEffect` that
runs once — an inline ref callback restarts it on every render, which is what
"the animation isn't smooth" turned out to mean.

## Lives, wrong taps, and the ad

Three rules that hold each other up:

- **Lives belong to the level, not the session.** Three per level; running
  out costs the level and nothing else, with the board there to try again.
  They used to be a session allowance refilling on a 15-minute timer, so
  three blocked taps while learning the rule locked a new player out of the
  game entirely.
- **A blocked tap marks the piece.** It stays highlighted and leaves by
  itself the moment its lane opens, so a wrong tap states an intention
  instead of only costing something. Queued pieces go one at a time on a
  short delay, and a chain of them unwinds in order.
- **No ad before level 10.** The only ad in the game offers a life to keep a
  failed board going; below that level a player is still learning what
  "blocked" means, and gets a plain retry instead.

The first two are what make the third safe, and they also close the obvious
hole in the second: if queuing were free, the winning move would be to tap
every piece and watch the board solve itself. Queuing costs a life, and
lives are per level, so a board can be queued at most three times. **The life
cost is the queue limit — do not add a separate one, and do not make queuing
free without adding one.**

## Sound

`lib/sound.ts` synthesises everything from oscillators and envelopes: no
audio files, so nothing to load or license, and the tones can be tuned to sit
with the look. Five sounds — a clear, a blocked tap, a hint, an undo and the
finishing phrase — all short and soft, because this is feedback rather than a
soundtrack. There is deliberately no background music: it is the first thing
players mute, and it works against a game whose whole difficulty is
concentration.

A run of clears steps up a pentatonic scale and resets after a pause, so
tapping quickly plays a rising phrase. Pentatonic because every step of it
agrees with every other — the game cannot make a wrong-sounding note.

Two things to know before changing it:

- **The audio context must be created inside a user gesture.** Every entry
  point is called from a tap handler, which is what makes that true. Creating
  it on mount gets it suspended.
- **Exponential ramps cannot end at zero**, and ramping to zero clicks on
  some browsers. Envelopes fall to 0.0001.

Sound is on by default, with a toggle in the play header and on the home
screen, stored as `soundEnabled` on the profile. A profile saved before sound
existed has no setting and reads as on. Worth knowing: on iOS, WebAudio
ignores the physical silent switch, so that toggle is the only way a player
can quiet the game.

## Look and feel

Six themes as CSS variables (`themes.ts`, applied by `ThemeStyle`). The
default is **Sepia**, chosen for older players: light, warm, high contrast.
`storage.ts` moves existing profiles off the superseded default exactly once,
guarded by a flag read from the raw stored object — without that guard it
re-runs on every load and a player can never keep the old theme.

Two things learned the hard way while choosing palettes:

- **Contrast ratio is the wrong metric for telling two pieces apart.** It
  measures legibility against a background. Use CIE Lab ΔE between piece
  colours.
- **Check palettes under simulated colour-vision deficiency.** A palette that
  looked excellent had blue `#1d4ed8` and violet `#6d28d9` at ΔE 0.8 under
  deuteranopia — indistinguishable for perhaps 8% of men.

The hint colour is per-theme for the same reason: a fixed amber sat at 2.07:1
on cream.

## Checks

| Check | Covers |
| --- | --- |
| `npm run verify` | solvability, coverage, nothing outside a silhouette, one-cell pieces, generation time |
| `npm run measure` | how much each tier gives away |
| `e2e:session` | ten checks over one level: load, blocked tap costs a life, hint, undo, zoom, completion, advance, no console errors |
| `e2e:fit` | every board fits three screen sizes with no scrollbar, cells stay within the size cap |
| `e2e:animation` | the slide-out's dash, duration, lockstep, and that later taps do not restart one in flight |
| `e2e:sound` | taps schedule notes, a run rises in pitch, a blocked tap differs, muting silences and persists |
| `e2e:lives` | lives are per level, a blocked tap marks its piece and it leaves when freed, running out ends the level, the ad floor holds |
| `e2e:playthrough` | plays a level to completion, tapping only legal pieces |

Run `verify` after anything in `mazeGenerator.ts`, `shapes.ts` or
`difficultyWave.ts`. It is a minute and it has caught every real generator
bug this project has had.

## Deploying

Vercel project `spacemanclub`. Pushing the branch builds a preview; a
production deploy is an explicit `create_deployment` with
`target: "production"` (the promote endpoint returns 422 for this project).
`master` holds the current work.

## Versions

Marked as branches rather than tags, because the push credential this was
built with is scoped to a branch and rejects tags.

| Marker | What it holds |
| --- | --- |
| `v1.1` | Silhouette boards, the Sepia theme, sound, per-level lives, queued pieces, the end-of-level stats card |
| `v1` | The first production-ready build, before any of the above |
| `v0.1` | The drag-to-trace game this started as |

## Known gaps

- **Difficulty is capped by monotonicity** (above). A genuine ordering
  constraint is the only way past it.
- **Hints (1–2) are untuned.** No data behind the number. Lives are three
  per level, which at least now fails safe.
- **`lib/pictures.ts` is disabled** (`PICTURES_ENABLED = false`). It reveals a
  pixel picture as pieces clear. If it comes back, note that a picture
  centred on the grid is now clipped by the silhouette.
- **No automated CI.** The checks above are run by hand.
