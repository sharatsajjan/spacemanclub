// Run with: node scripts/e2e/exit-animation.cjs
// Needs a dev or production server already running (npm run dev).
//   BASE_URL        where to point (default http://localhost:3000)
//   CHROMIUM_PATH   a browser to use instead of Playwright's own
const { chromium } = require("playwright");
const { BASE, LAUNCH } = require("./harness.cjs");
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
function canExit(present, cells, cols, rows, dir) {
  const [dr, dc] = DIRS[dir]; const h = cells[0];
  let r = h.row + dr, c = h.col + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) { if (present[r][c]) return false; r += dr; c += dc; }
  return true;
}
function bendCount(p) {
  let n = 0;
  for (let i = 2; i < p.cells.length; i++) {
    const q = p.cells[i-2], a = p.cells[i-1], b = p.cells[i];
    if (q.row - a.row !== a.row - b.row || q.col - a.col !== a.col - b.col) n++;
  }
  return n;
}
const out = []; const step = (n, ok, d = "") => { out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } });
  await page.addInitScript(() => localStorage.setItem("arrowflow.profile.v2", JSON.stringify({ currentLevel: 23, bestLevelReached: 23, coins: 0, totalStars: 0, totalLevelsCompleted: 23 - 1, lives: 3, nextLifeAt: null, theme: "ocean", playerName: "Player", collectedPictures: [] })));

  // The board is seeded randomly on every page load, so it has to be
  // re-read after each navigation — the same cell belongs to a different
  // piece next time.
  async function loadBoard() {
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="maze-canvas"]');
    const pieces = JSON.parse(await page.getAttribute('[data-testid="maze-canvas"]', "data-pieces"));
    const rows = Math.max(...pieces.flatMap(p => p.cells.map(c => c.row))) + 1;
    const cols = Math.max(...pieces.flatMap(p => p.cells.map(c => c.col))) + 1;
    // Derived from the pieces: a board cut to a silhouette leaves cells
    // outside the shape empty, and treating them as occupied makes every
    // piece facing that way look blocked.
    const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const p of pieces) for (const c of p.cells) present[c.row][c.col] = true;
    const clearable = pieces.filter(p => canExit(present, p.cells, cols, rows, p.direction));
    const bent = [...clearable].sort((a, b) => bendCount(b) - bendCount(a))[0];
    return { clearable, bent };
  }
  const tap = (p) => page.click(`[data-row="${p.cells[0].row}"][data-col="${p.cells[0].col}"]`);
  const tapFast = (p) => page.evaluate(([r, c]) =>
    document.querySelector(`[data-row="${r}"][data-col="${c}"]`).click(), [p.cells[0].row, p.cells[0].col]);
  // Both the halo layer and the coloured layer draw the exiting piece.
  const bodyPaths = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="maze-canvas"] svg path[stroke-dasharray]')].map(p => {
      const [body, gap] = p.getAttribute("stroke-dasharray").split(" ").map(Number);
      return { body, gap, total: p.getTotalLength(), runOut: -Number(p.getAttribute("stroke-dashoffset")),
               t: p.getAnimations()[0]?.currentTime ?? null };
    }));

  // 1. The dash is measured off the real path, not estimated from the cell
  //    count — the estimate drifted by ~0.14 units per bend.
  {
    const { bent } = await loadBoard();
    await tap(bent);
    await page.waitForTimeout(40);
    const g = await bodyPaths();
    step("exit dash is measured from the real path",
      g.length > 0 && g.every(x => Math.abs(x.body - (x.total - x.runOut)) < 0.001 && x.gap > x.total),
      g.length ? `${bendCount(bent)} bends, body=${g[0].body.toFixed(3)} total=${g[0].total.toFixed(3)} runOut=${g[0].runOut.toFixed(3)}` : "no exiting path");
  }

  // 2. An in-flight slide must not be rewound when the board re-renders,
  //    which it does on every later tap. Identified by the exiting path's
  //    own `d`, so this follows one specific piece rather than whichever
  //    animation happens to be running.
  {
    const { clearable, bent } = await loadBoard();
    // The longest traveller available, so it is certainly still in flight
    // after the later taps land.
    const travel = (p) => (p.direction === "up" ? p.cells[0].row : p.direction === "down" ? 40 - p.cells[0].row
      : p.direction === "left" ? p.cells[0].col : 40 - p.cells[0].col) + p.cells.length;
    const slow = [...clearable].sort((a, b) => travel(b) - travel(a))[0] ?? bent;
    await tapFast(slow);
    await page.waitForTimeout(40);
    const probe = (key) => page.evaluate((k) => {
      const p = [...document.querySelectorAll('[data-testid="maze-canvas"] svg path[stroke-dasharray]')]
        .find(el => k === null || el.getAttribute("d") === k);
      if (!p) return null;
      const a = p.getAnimations()[0];
      return a ? { d: p.getAttribute("d"), t: Number(a.currentTime), start: Number(a.startTime) } : null;
    }, key);

    const before = await probe(null);
    const others = clearable.filter(p => p.id !== slow.id).slice(0, 2);
    for (const o of others) { await tapFast(o); await page.waitForTimeout(45); }
    const after = before ? await probe(before.d) : null;
    step("in-flight slide is not restarted by later taps",
      before != null && after != null && after.start === before.start && after.t >= before.t,
      before == null ? "no in-flight path to follow"
        : after == null ? "the piece's animation disappeared"
        : `same startTime=${after.start === before.start}, currentTime ${before.t.toFixed(0)} -> ${after.t.toFixed(0)}`);
  }

  // 3. Body and arrowhead share one duration and easing, so they stay glued.
  {
    const { bent } = await loadBoard();
    await tap(bent);
    await page.waitForTimeout(40);
    // Only the board's own animations: finishing a level sets off the paper
    // burst, whose scraps have durations of their own.
    const timings = await page.evaluate(() => document.getAnimations()
      .filter(a => a.effect?.target?.closest?.('[data-testid="maze-canvas"]'))
      .map(a => `${a.effect.getTiming().duration}/${a.effect.getTiming().easing}`));
    const uniq = [...new Set(timings)];
    step("body and arrowhead animate in lockstep", timings.length >= 2 && uniq.length === 1,
      `${timings.length} animations, timing ${uniq.join(" | ")}`);
  }

  // 4. Duration is derived from the distance the piece actually travels
  //    rather than being a fixed number for every piece. Checked against the
  //    formula for each exit, so it does not depend on the randomly seeded
  //    board happening to offer a long traveller.
  const expectedMs = (p, cols, rows) => {
    const h = p.cells[0];
    const edge = p.direction === "up" ? h.row + 0.5
      : p.direction === "down" ? rows - h.row - 0.5
      : p.direction === "left" ? h.col + 0.5
      : cols - h.col - 0.5;
    return Math.min(950, Math.max(200, Math.round((edge + 1 + p.cells.length) * 30)));
  };
  {
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="maze-canvas"]');
    const pieces = JSON.parse(await page.getAttribute('[data-testid="maze-canvas"]', "data-pieces"));
    const rows = Math.max(...pieces.flatMap(p => p.cells.map(c => c.row))) + 1;
    const cols = Math.max(...pieces.flatMap(p => p.cells.map(c => c.col))) + 1;
    // Derived from the pieces: a board cut to a silhouette leaves cells
    // outside the shape empty, and treating them as occupied makes every
    // piece facing that way look blocked.
    const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const p of pieces) for (const c of p.cells) present[c.row][c.col] = true;
    const remaining = new Set(pieces.map(p => p.id));
    const seen = [];
    let mismatch = null, stopped = "ran out of iterations";
    for (let i = 0; i < 60 && remaining.size; i++) {
      const next = [...remaining].map(id => pieces[id])
        .find(p => canExit(present, p.cells, cols, rows, p.direction));
      if (!next) { stopped = `no clearable piece left with ${remaining.size} remaining`; break; }
      await tap(next);
      await page.waitForTimeout(20);
      const d = await page.evaluate(() => {
        const a = document.getAnimations()
          .filter(x => x.effect?.target?.closest?.('[data-testid="maze-canvas"]'));
        return a.length ? a[a.length - 1].effect.getTiming().duration : null;
      });
      const want = expectedMs(next, cols, rows);
      if (d != null) {
        seen.push(d);
        if (d !== want && mismatch === null) mismatch = `piece ${next.id}: got ${d}ms, expected ${want}ms`;
      }
      for (const c of next.cells) present[c.row][c.col] = false;
      remaining.delete(next.id);
      await page.waitForTimeout(660);
    }
    const uniq = [...new Set(seen)].sort((a, b) => a - b);
    step("duration follows the travel distance", seen.length >= 8 && mismatch === null,
      mismatch ?? `${seen.length} exits all match the formula (${uniq[0]}..${uniq[uniq.length-1]}ms, ${uniq.length} distinct); stopped: ${stopped}`);
  }

  console.log(out.join("\n"));
  await browser.close();
})();
