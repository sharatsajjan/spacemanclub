// Run with: node scripts/e2e/board-fit.cjs
// Needs a dev or production server already running (npm run dev).
//   BASE_URL        where to point (default http://localhost:3000)
//   CHROMIUM_PATH   a browser to use instead of Playwright's own
const { chromium } = require("playwright");
const { BASE, LAUNCH } = require("./harness.cjs");
const out = []; const step = (n, ok, d = "") => { out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(LAUNCH);
  // A narrow phone, a wide phone and a small tablet.
  for (const [W, H] of [[360, 780], [540, 1050], [768, 1024]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    const sizes = [];
    let allFit = true; const cells = []; const areas = []; const fills = [];
    for (const lv of [1, 5, 10, 16, 23, 40, 80, 120]) {
      await page.addInitScript((l) => localStorage.setItem("arrowflow.profile.v2", JSON.stringify({
        currentLevel: l, bestLevelReached: l, coins: 0, totalStars: 0, totalLevelsCompleted: l - 1,
        lives: 3, nextLifeAt: null, theme: "ocean", playerName: "Player" })), lv);
      await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="maze-canvas"]');
      await page.waitForTimeout(220);
      const m = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="maze-canvas"]');
        const frame = canvas.closest(".overflow-auto");
        const c = canvas.getBoundingClientRect(), f = frame.getBoundingClientRect();
        let maxC = 0; canvas.querySelectorAll("[data-row]").forEach(el => { maxC = Math.max(maxC, +el.dataset.col); });
        return { cw: c.width, ch: c.height, fw: f.width, fh: f.height, cols: maxC + 1,
                 overflows: frame.scrollWidth > frame.clientWidth + 1 || frame.scrollHeight > frame.clientHeight + 1 };
      });
      const cell = m.cw / m.cols;
      if (m.overflows || m.cw > m.fw + 1 || m.ch > m.fh + 1) allFit = false;
      cells.push(cell);
      sizes.push(m.cw);
      areas.push(m.cw * m.ch);
      const byWidth = m.cw >= m.fw - 2, byHeight = m.ch >= m.fh - 2, byCellCap = cell >= 39.5;
      fills.push({ byWidth, byHeight, byCellCap,
        why: `lv${lv}:${byWidth ? "W" : byHeight ? "H" : byCellCap ? "cap" : "NONE(" + m.cw.toFixed(0) + "x" + m.ch.toFixed(0) + " in " + m.fw.toFixed(0) + "x" + m.fh.toFixed(0) + ")"}` });
    }
    step(`${W}x${H}: every board fits with no scrollbar at zoom 1`, allFit);
    // 40px is the cap the code sets; the floor is whatever the smallest
    // screen forces once the biggest board has to fit on it.
    const lo = Math.min(...cells), hi = Math.max(...cells);
    step(`${W}x${H}: cells never drawn larger than the 40px cap`, hi <= 40.5,
      `range ${lo.toFixed(1)}-${hi.toFixed(1)}px`);
    // The whole point: the canvas should grow with the puzzle, not be
    // constant. Measured by area, not width — boards are now cut to
    // silhouettes of different proportions, so a tall board later in the
    // game can legitimately be narrower than a square one before it.
    const grew = areas[areas.length - 1] > areas[0] * 1.5;
    const monotonic = areas.every((v, i) => i === 0 || v >= areas[i - 1] * 0.75);
    step(`${W}x${H}: canvas grows with puzzle size`, grew && monotonic,
      `areas ${areas.map(a => (a / 1000).toFixed(0) + "k").join(" -> ")}`);
    // And it should use the space it has: every board is held either by the
    // width of the frame, its height, or the cap on how big a cell is drawn.
    step(`${W}x${H}: every board is limited by the frame or the cell cap`,
      fills.every((f) => f.byWidth || f.byHeight || f.byCellCap),
      fills.map((f) => f.why).join(" "));
    await page.close();
  }
  console.log(out.join("\n"));
  await b.close();
})();
