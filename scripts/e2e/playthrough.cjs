// Run with: node scripts/e2e/playthrough.cjs
// Needs a dev or production server already running (npm run dev).
//   BASE_URL        where to point (default http://localhost:3000)
//   CHROMIUM_PATH   a browser to use instead of Playwright's own
// Plays a level to completion as a user would: reads the board from the DOM,
// works out a legal move, taps it, and repeats. Also exercises hint, undo and
// zoom, and checks nothing outside the silhouette is tappable.
const { chromium } = require("playwright");
const { BASE, LAUNCH } = require("./harness.cjs");

const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function canExit(present, piece, cols, rows) {
  const [dr, dc] = DIR[piece.direction];
  let { row, col } = piece.cells[0];
  for (;;) {
    row += dr; col += dc;
    if (row < 0 || col < 0 || row >= rows || col >= cols) return true;
    if (present[row][col]) return false;
  }
}

(async () => {
  const level = Number(process.argv[2] || 7);
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript((lv) => localStorage.setItem("arrowflow.profile.v2", JSON.stringify({
    currentLevel: lv, bestLevelReached: lv, coins: 0, totalStars: 0, totalLevelsCompleted: lv - 1,
    lives: 3, nextLifeAt: null, playerName: "Player", collectedPictures: [] })), level);
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="maze-canvas"]');

  const canvas = page.locator('[data-testid="maze-canvas"]');
  const pieces = JSON.parse(await canvas.getAttribute("data-pieces"));
  const cells = page.locator('[data-testid="maze-canvas"] [data-row]');
  const tappable = await cells.count();
  const rows = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.row))) + 1;
  const cols = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.col))) + 1;

  const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const pieceCells = pieces.reduce((n, p) => n + p.cells.length, 0);
  for (const p of pieces) for (const c of p.cells) present[c.row][c.col] = true;
  const insideCells = present.flat().filter(Boolean).length;

  const report = { level, pieces: pieces.length, grid: `${cols}x${rows}`, insideCells, tappable };

  // Boosters, once each, early on — a player reaches for them when stuck.
  await page.getByRole("button", { name: /hint/i }).click();
  await page.waitForTimeout(250);
  report.hintHighlighted = await page.locator('[data-testid="maze-canvas"] [data-hint="true"]').count();
  await page.getByRole("button", { name: /zoom/i }).click();
  await page.waitForTimeout(250);
  const zoomed = await canvas.boundingBox();
  await page.getByRole("button", { name: /zoom/i }).click();
  await page.getByRole("button", { name: /zoom/i }).click();
  await page.waitForTimeout(250);
  const unzoomed = await canvas.boundingBox();
  report.zoomGrew = zoomed.width > unzoomed.width + 1;

  const remaining = new Set(pieces.map((p) => p.id));
  let taps = 0, undone = false;
  while (remaining.size > 0) {
    const next = [...remaining].map((id) => pieces[id]).find((p) => canExit(present, p, cols, rows));
    if (!next) { report.stuck = `${remaining.size} pieces left`; break; }
    const head = next.cells[0];
    await page.locator(`[data-row="${head.row}"][data-col="${head.col}"]`).click();
    taps++;
    for (const c of next.cells) present[c.row][c.col] = false;
    remaining.delete(next.id);

    // Undo the first clear, check it comes back, then redo it.
    if (!undone) {
      undone = true;
      await page.waitForTimeout(150);
      await page.getByRole("button", { name: /undo/i }).click();
      await page.waitForTimeout(250);
      const back = await page.locator(`[data-row="${head.row}"][data-col="${head.col}"]`).getAttribute("data-present");
      report.undoRestored = back === "true";
      await page.locator(`[data-row="${head.row}"][data-col="${head.col}"]`).click();
      await page.waitForTimeout(150);
    }
    if (taps % 8 === 0) await page.waitForTimeout(60);
  }

  await page.waitForTimeout(1200);
  report.taps = taps;
  report.lifeDrops = await page.locator("text=/Out of lives/").count();
  const body = await page.textContent("body");
  report.completed = /complete|Level \d+ cleared|Next level|Nice/i.test(body);
  report.completionText = (body.match(/(Level complete|Nice work|Cleared|Next level)[^<]{0,40}/i) || [""])[0];
  report.errors = errors.slice(0, 3);
  // A screenshot only when somewhere to put it was given:
  //   npm run e2e:playthrough -- 23 ./shots/level
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}-lv${level}.png` });
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
