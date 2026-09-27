// Run with: node scripts/e2e/lives-and-queue.cjs [level]
// Needs a dev or production server already running (npm run dev).
//
// Covers the failure economy: lives belong to the level, a blocked tap marks
// the piece and it leaves by itself once its lane opens, running out ends
// the level rather than the session, and no ad is offered before level 10.
const { chromium } = require("playwright");
const { BASE, LAUNCH } = require("./harness.cjs");
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
function canExit(present, piece, cols, rows) {
  const [dr, dc] = DIRS[piece.direction];
  let { row, col } = piece.cells[0];
  for (;;) {
    row += dr; col += dc;
    if (row < 0 || col < 0 || row >= rows || col >= cols) return true;
    if (present[row][col]) return false;
  }
}
const out = [];
const step = (n, ok, d = "") => { out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) process.exitCode = 1; };

(async () => {
  const level = Number(process.argv[2] || 12);
  const b = await chromium.launch(LAUNCH);
  const page = await b.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.addInitScript((lv) => localStorage.setItem("arrowflow.profile.v2", JSON.stringify({
    currentLevel: lv, bestLevelReached: lv, coins: 0, totalStars: 0, totalLevelsCompleted: lv - 1,
    lives: 3, nextLifeAt: null, playerName: "Player", collectedPictures: [] })), level);
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="maze-canvas"]');

  const pieces = JSON.parse(await page.getAttribute('[data-testid="maze-canvas"]', "data-pieces"));
  const rows = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.row))) + 1;
  const cols = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.col))) + 1;
  const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const p of pieces) for (const c of p.cells) present[c.row][c.col] = true;
  const tap = (p) => page.click(`[data-row="${p.cells[0].row}"][data-col="${p.cells[0].col}"]`);
  const lives = () => page.getAttribute('[aria-label*="lives remaining"]', "aria-label");

  step("counter shows what is left", (await page.textContent("body")).includes(`${pieces.length} / ${pieces.length} left`),
    `expected "${pieces.length} / ${pieces.length} left"`);
  step("three lives at the start", (await lives()).startsWith("3 of 3"), await lives());

  // A blocked tap queues the piece rather than only costing a life.
  const blocked = pieces.find((p) => !canExit(present, p, cols, rows));
  await tap(blocked);
  await page.waitForTimeout(200);
  step("a blocked tap costs a life", (await lives()).startsWith("2 of 3"), await lives());
  step("the blocked piece is marked", await page.locator('[data-queued="true"]').count() === 1);

  // Clear whatever frees it, and it should leave on its own.
  const freed = new Set();
  let autoWent = false;
  for (let i = 0; i < 60 && !autoWent; i++) {
    const next = pieces.find((p) => !freed.has(p.id) && p.id !== blocked.id &&
      present[p.cells[0].row][p.cells[0].col] && canExit(present, p, cols, rows));
    if (!next) break;
    await tap(next);
    for (const c of next.cells) present[c.row][c.col] = false;
    freed.add(next.id);
    await page.waitForTimeout(120);
    if (canExit(present, blocked, cols, rows)) {
      // Give the queued piece its delay plus its slide.
      await page.waitForTimeout(1400);
      autoWent = await page.locator('[data-queued="true"]').count() === 0;
      if (autoWent) for (const c of blocked.cells) present[c.row][c.col] = false;
    }
  }
  step("the queued piece leaves by itself once its lane opens", autoWent);

  // Three blocked taps end the level.
  const stillBlocked = pieces.filter((p) => !freed.has(p.id) && p.id !== blocked.id &&
    present[p.cells[0].row]?.[p.cells[0].col] && !canExit(present, p, cols, rows));
  for (const p of stillBlocked.slice(0, 2)) { await tap(p); await page.waitForTimeout(180); }
  const body = await page.textContent("body");
  step("running out of lives ends the level, not the session", body.includes("Out of lives") && body.includes("Try level"),
    body.includes("Out of lives") ? "shown" : "not shown");
  step("the ad offer respects the level floor", level >= 10 ? body.includes("Watch ad") : !body.includes("Watch ad"),
    `level ${level}, ad ${body.includes("Watch ad") ? "offered" : "hidden"}`);
  step("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  console.log(out.join("\n"));
  await b.close();
})();
