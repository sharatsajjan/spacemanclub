// Shared settings for the browser checks. Everything here is environment,
// not test logic: where the app is served and which browser to drive.
const BASE = process.env.BASE_URL || "http://localhost:3000";

// Playwright brings its own browser. A pre-installed one is used when
// CHROMIUM_PATH points at it, which is how the container images that skip
// the browser download are set up.
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

module.exports = { BASE, LAUNCH };
