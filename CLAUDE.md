# Working notes for agents

Read `README.md` first — especially **Invariants** and **What makes a board
hard**. Both record mistakes that have already been made here.

## Before you finish

- `npm run typecheck && npm run lint && npm run build`
- Touched `lib/mazeGenerator.ts`, `lib/shapes.ts` or `lib/difficultyWave.ts`?
  Run `npm run verify` — a board that cannot be finished is the one bug in
  this project a player cannot work around. `npm run measure` if the change
  was meant to affect difficulty; quote the before and after.
- Touched anything a player touches? Run the browser checks against a dev
  server (`npm run e2e`), and play a level end to end
  (`npm run e2e:playthrough -- <level>`).

## Things that will waste your time otherwise

- **Boards are re-seeded on every page load.** A level number does not
  reproduce a board. Read the live board from the `data-pieces` attribute on
  `[data-testid="maze-canvas"]`; the tap targets carry `data-row` /
  `data-col` / `data-present`.
- **`next build` overwrites `.next` under a running dev server**, which then
  serves dead chunk references. Restart the dev server after a build.
- **`document.getAnimations()` picks up the completion confetti.** Scope
  animation checks to the canvas.
- **Tag pushes are rejected (403)** — the credential is scoped to the branch.
  Use a branch as a version marker.
- **This container cannot reach `vercel.app`.** A production deploy can be
  confirmed through the Vercel API, not by loading the page. Ask for it by
  the alias (`get_deployment` on `spacemanclub.vercel.app`) rather than by
  deployment id: by id it can report `BUILDING` for minutes after the build
  has actually finished.
- **Pushing `master` deploys to production by itself.** The Vercel project
  is connected to the repo, so a push to `master` builds and takes the
  alias. Creating a deployment by hand after that just rebuilds the same
  commit.

## Rules that are load-bearing

- **Queuing a blocked piece costs a life, and lives are per level.** That is
  what stops a player queuing the whole board and watching it solve itself.
  Do not make queuing free, and do not lift the life cost, without replacing
  the cap with something else.

## Style

The code is commented in prose, explaining *why* rather than what — including
the approaches that failed and why they failed. Keep that; it is most of what
makes this repo workable by someone who was not here.
