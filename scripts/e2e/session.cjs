// Run with: node scripts/e2e/session.cjs
// Needs a dev or production server already running (npm run dev).
//   BASE_URL        where to point (default http://localhost:3000)
//   CHROMIUM_PATH   a browser to use instead of Playwright's own
const { chromium } = require("playwright");
const { BASE, LAUNCH } = require("./harness.cjs");

const SHOT_DIR = "/tmp/claude-0/-home-user-spacemanclub/ca4f9f57-c9b4-5b2c-8092-3e162aef75ce/scratchpad";
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

// Mirrors lib/rules.ts: a piece threads out along its own line, so only the
// straight lane from its HEAD (cells[0]) to the edge has to be clear.
// Mirrors lib/rules.ts: the head's straight lane must be clear of ALL
// present cells, the piece's own body included.
function pieceCanExit(present, pig, pieceId, cells, cols, rows, dir) {
  const [dr, dc] = DIRS[dir];
  const head = cells[0];
  let r = head.row + dr, c = head.col + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    if (present[r][c]) return false;
    r += dr; c += dc;
  }
  return true;
}

const log = [];
function step(name, ok, detail = "") {
  log.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 420, height: 880 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="maze-canvas"]', { timeout: 20000 });

  const startLevel = parseInt(process.argv[2] || "0", 10);
  if (startLevel > 0) {
    await page.evaluate((lv) => {
      localStorage.setItem("arrowflow.profile.v2", JSON.stringify({
        currentLevel: lv, bestLevelReached: lv, coins: 0, totalStars: 0,
        totalLevelsCompleted: lv - 1, lives: 3, nextLifeAt: null, theme: "ocean", playerName: "Player",
      }));
    }, startLevel);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="maze-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(300);
  }

  const read = async () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="maze-canvas"]');
    const style = getComputedStyle(el);
    const cols = style.gridTemplateColumns.split(" ").length;
    const rows = style.gridTemplateRows.split(" ").length;
    const cells = [...document.querySelectorAll("[data-row]")].map((b) => ({
      row: +b.dataset.row, col: +b.dataset.col, present: b.dataset.present === "true",
    }));
    return { pieces: JSON.parse(el.dataset.pieces), cols, rows, cells };
  });
  // The board counts down what is left, not up what is done.
  const progress = async () => (await page.evaluate(() => document.body.innerText.match(/(\d+) \/ (\d+) left/)?.[0])) ?? "?";
  const lives = async () => page.$$eval('[aria-label$="lives remaining"] svg', (els) =>
    els.filter((e) => !e.style.color.includes("chip")).length);
  const badge = async (label) => page.$eval(`button[aria-label^="${label}"]`, (b) => b.textContent.replace(/[A-Za-z]/g, "").trim());

  const { pieces, cols, rows, cells } = await read();
  const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const pig = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  for (const c of cells) present[c.row][c.col] = c.present;
  for (const p of pieces) for (const c of p.cells) pig[c.row][c.col] = p.id;

  const level = await page.evaluate(() => document.body.innerText.match(/Level (\d+)/)?.[1]);
  step("level loads", !!level, `Level ${level}, ${pieces.length} pieces, ${cols}x${rows} board`);

  // 1. blocked tap costs a life
  const blocked = pieces.find((p) => !pieceCanExit(present, pig, p.id, p.cells, cols, rows, p.direction));
  const livesBefore = await lives();
  if (blocked) {
    const before = await progress();
    await page.click(`[data-row="${blocked.cells[0].row}"][data-col="${blocked.cells[0].col}"]`);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${SHOT_DIR}/run-blocked.png` });
    await page.waitForTimeout(350);
    const after = await progress();
    const livesAfter = await lives();
    step("blocked tap costs a life, clears nothing", after === before && livesAfter === livesBefore - 1,
      `lives ${livesBefore}->${livesAfter}, progress ${after}`);
  } else {
    step("blocked tap", true, "skipped (no blocked piece on this board)");
  }

  // 2. hint highlights a clearable piece
  const hintsBefore = await badge("Hint");
  await page.click('button[aria-label^="Hint"]');
  await page.waitForTimeout(250);
  const hinted = await page.$$eval('[data-testid="maze-canvas"] svg g.animate-pulse', (g) => g.length);
  await page.screenshot({ path: `${SHOT_DIR}/run-hint.png` });
  step("hint highlights a piece and decrements", hinted > 0 && (await badge("Hint")) === String(+hintsBefore - 1),
    `hinted groups=${hinted}, badge ${hintsBefore}->${await badge("Hint")}`);

  // 3. clear one, then undo it
  const clearable = pieces.filter((p) => pieceCanExit(present, pig, p.id, p.cells, cols, rows, p.direction));
  const undoDisabledBefore = await page.$eval('button[aria-label^="Undo"]', (b) => b.disabled);
  const beforeClear = await progress();
  await page.click(`[data-row="${clearable[0].cells[0].row}"][data-col="${clearable[0].cells[0].col}"]`);
  await page.waitForTimeout(200);
  const afterClear = await progress();
  step("tap clears a piece", afterClear !== beforeClear, `${beforeClear} -> ${afterClear}`);

  const undoBadgeBefore = await badge("Undo");
  await page.click('button[aria-label^="Undo"]');
  await page.waitForTimeout(250);
  const afterUndo = await progress();
  step("undo restores the piece", afterUndo === beforeClear && undoDisabledBefore === true,
    `${afterClear} -> ${afterUndo}, badge ${undoBadgeBefore}->${await badge("Undo")}, was disabled at start=${undoDisabledBefore}`);

  // 4. zoom
  const w = async () => page.$eval('[data-testid="maze-canvas"]', (el) => Math.round(el.getBoundingClientRect().width));
  const w1 = await w();
  await page.click('button[aria-label^="Zoom"]'); await page.waitForTimeout(250);
  const w2 = await w();
  await page.click('button[aria-label^="Zoom"]'); await page.waitForTimeout(250);
  const w3 = await w();
  await page.screenshot({ path: `${SHOT_DIR}/run-zoom.png` });
  await page.click('button[aria-label^="Zoom"]'); await page.waitForTimeout(250);
  const w4 = await w();
  step("zoom cycles 1x/1.5x/2.25x and resets", (w2 / w1).toFixed(2) === "1.50" && (w3 / w1).toFixed(2) === "2.25" && w4 === w1,
    `${w1} -> ${w2} -> ${w3} -> ${w4}`);

  const barVisible = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="Hint"]').getBoundingClientRect();
    return b.bottom <= window.innerHeight && b.top > window.innerHeight * 0.5;
  });
  step("booster bar stays pinned in the lower half", barVisible);

  // 4b. the theme picker, reachable from the board itself
  const pageColour = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--outer").trim());
  const before = await pageColour();
  await page.click('button[aria-label="Change theme"]');
  await page.waitForTimeout(200);
  const offered = await page.locator('[data-testid="theme-sheet"] button[aria-label$="theme"]').count();
  step("the palette opens a theme picker", offered >= 5, `${offered} themes offered`);

  // Whichever theme is not the current one, so the change is visible.
  const otherTheme = await page.evaluate(() => {
    const current = getComputedStyle(document.documentElement).getPropertyValue("--outer").trim();
    const buttons = [...document.querySelectorAll('[data-testid="theme-sheet"] button[aria-label$="theme"]')];
    const pick = buttons.find((b) => b.querySelector("span")?.style.background !== current) ?? buttons[1];
    pick.click();
    return pick.getAttribute("aria-label");
  });
  await page.waitForTimeout(250);
  const after = await pageColour();
  step("choosing a theme repaints the board", before !== after, `${otherTheme}: ${before} -> ${after}`);

  await page.click("text=Done");
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("arrowflow.profile.v2")).theme);
  const stillPlaying = await page.locator('[data-testid="maze-canvas"]').count();
  step("the choice is kept and the level is still there", !!stored && stillPlaying === 1, `theme=${stored}`);

  // Back to the theme the rest of the run expects.
  await page.click('button[aria-label="Change theme"]');
  await page.waitForTimeout(150);
  await page.click('[data-testid="theme-sheet"] button[aria-label="Sepia theme"]');
  await page.click("text=Done");
  await page.waitForTimeout(200);

  // 5. solve the level, only tapping pieces that can legally exit
  let taps = 0;
  for (let round = 0; round < pieces.length + 10; round++) {
    const live = await page.$('[data-testid="maze-canvas"]');
    if (!live) break;
    const snap = await page.$$eval("[data-row]", (els) => els.map((b) => ({ row: +b.dataset.row, col: +b.dataset.col, present: b.dataset.present === "true" })));
    const pres = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const c of snap) pres[c.row][c.col] = c.present;
    const remaining = pieces.filter((p) => pres[p.cells[0].row][p.cells[0].col]);
    if (remaining.length === 0) break;
    const next = remaining.find((p) => pieceCanExit(pres, pig, p.id, p.cells, cols, rows, p.direction));
    if (!next) { step("solvable to the end", false, `stuck with ${remaining.length} pieces left`); break; }
    await page.click(`[data-row="${next.cells[0].row}"][data-col="${next.cells[0].col}"]`);
    taps++;
  }
  await page.waitForTimeout(600);
  // The heading is the uncovered picture's name when there was one, and
  // "Level Complete!" only on boards too small to hide a picture — so key
  // off the next-level button, which both variants show.
  const body = await page.evaluate(() => document.body.innerText);
  const onCompleteScreen = !(await page.$('[data-testid="maze-canvas"]')) && /Level \d+\s*→/.test(body);
  step("level completes", onCompleteScreen, `${taps} taps, heading="${body.split("\n").find((l) => l.trim()) ?? ""}"`);
  await page.screenshot({ path: `${SHOT_DIR}/run-complete.png` });

  // 6. advance to the next level
  const nextBtn = await page.$('button:has-text("Level")');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForSelector('[data-testid="maze-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(400);
    const newLevel = await page.evaluate(() => document.body.innerText.match(/Level (\d+)/)?.[1]);
    step("advances to next level", +newLevel === +level + 1, `Level ${level} -> ${newLevel}`);
    await page.screenshot({ path: `${SHOT_DIR}/run-next.png` });
  } else {
    step("advances to next level", false, "next-level button not found");
  }

  step("no console/page errors", errors.length === 0, errors.join(" | "));

  console.log(log.join("\n"));
  await browser.close();
})();
