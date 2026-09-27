// Run with: node scripts/e2e/sound.cjs
// Needs a dev or production server already running (npm run dev).
//   BASE_URL        where to point (default http://localhost:3000)
//   CHROMIUM_PATH   a browser to use instead of Playwright's own
//
// Headless Chromium has no speakers, so this checks the thing that can
// actually be checked: that taps schedule oscillators, that the pitch of a
// run of clears rises, that a blocked tap sounds different from a clear, and
// that muting stops all of it. AudioContext is wrapped before the page runs.
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
const step = (name, ok, detail = "") => {
  out.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  const level = Number(process.argv[2] || 12);
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.addInitScript((lv) => {
    localStorage.setItem("arrowflow.profile.v2", JSON.stringify({
      currentLevel: lv, bestLevelReached: lv, coins: 0, totalStars: 0, totalLevelsCompleted: lv - 1,
      lives: 3, nextLifeAt: null, playerName: "Player", collectedPictures: [] }));
    // Record every oscillator the page starts, with its pitch.
    window.__notes = [];
    const Ctor = window.AudioContext;
    const wrap = function (...args) {
      const ctx = new Ctor(...args);
      const create = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = () => {
        const osc = create();
        // The pitch is scheduled for a future time, so frequency.value still
        // reads the 440Hz default when start() is called. Record what was
        // scheduled instead.
        let scheduled = null;
        const setValueAtTime = osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime = (value, when) => {
          if (scheduled === null) scheduled = value;
          return setValueAtTime(value, when);
        };
        const start = osc.start.bind(osc);
        osc.start = (when) => {
          window.__notes.push({ freq: scheduled === null ? osc.frequency.value : scheduled, type: osc.type });
          return start(when);
        };
        return osc;
      };
      return ctx;
    };
    window.AudioContext = wrap;
    window.webkitAudioContext = wrap;
  }, level);

  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="maze-canvas"]');
  const pieces = JSON.parse(await page.getAttribute('[data-testid="maze-canvas"]', "data-pieces"));
  const rows = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.row))) + 1;
  const cols = Math.max(...pieces.flatMap((p) => p.cells.map((c) => c.col))) + 1;
  const present = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const p of pieces) for (const c of p.cells) present[c.row][c.col] = true;

  const notes = () => page.evaluate(() => window.__notes.slice());
  const reset = () => page.evaluate(() => { window.__notes.length = 0; });
  const legalPiece = () => pieces.filter((p) => canExit(present, p, cols, rows))[0];
  const tap = async (piece) => {
    const head = piece.cells[0];
    await page.click(`[data-row="${head.row}"][data-col="${head.col}"]`);
  };

  step("silent until the player does something", (await notes()).length === 0);

  // 1. A clear makes a sound.
  const first = legalPiece();
  await tap(first);
  for (const c of first.cells) present[c.row][c.col] = false;
  const afterClear = await notes();
  step("clearing a piece plays a note", afterClear.length > 0, `${afterClear.length} oscillators`);

  // 2. A run of clears rises in pitch.
  const pitches = [afterClear[0].freq];
  for (let i = 0; i < 3; i++) {
    const piece = pieces.filter((p) => present[p.cells[0].row]?.[p.cells[0].col] && canExit(present, p, cols, rows))[0];
    if (!piece) break;
    await reset();
    await tap(piece);
    for (const c of piece.cells) present[c.row][c.col] = false;
    const n = await notes();
    if (n.length) pitches.push(n[0].freq);
  }
  const rising = pitches.every((f, i) => i === 0 || f > pitches[i - 1]);
  step("a run of clears rises in pitch", pitches.length >= 3 && rising,
    pitches.map((f) => f.toFixed(0) + "Hz").join(" -> "));

  // 3. A blocked tap is a different sound, lower than any clear.
  const blocked = pieces.find((p) => present[p.cells[0].row]?.[p.cells[0].col] && !canExit(present, p, cols, rows));
  await reset();
  await tap(blocked);
  const blockedNotes = await notes();
  step("a blocked tap sounds different", blockedNotes.length > 0 && blockedNotes[0].freq < Math.min(...pitches),
    blockedNotes.length ? `${blockedNotes[0].freq.toFixed(0)}Hz vs clears from ${Math.min(...pitches).toFixed(0)}Hz` : "silent");

  // 4. Muting stops everything, and survives a reload.
  await page.click('[aria-label="Turn sound off"]');
  await reset();
  const next = pieces.filter((p) => present[p.cells[0].row]?.[p.cells[0].col] && canExit(present, p, cols, rows))[0];
  await tap(next);
  step("muting silences the board", (await notes()).length === 0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("arrowflow.profile.v2")).soundEnabled);
  step("the mute setting is remembered", stored === false, `stored soundEnabled=${stored}`);

  step("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(out.join("\n"));
  await browser.close();
})();
