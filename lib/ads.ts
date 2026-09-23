/**
 * The one place the game talks to an ad network. Callers only ever ask
 * "show the between-levels ad" or "show a rewarded ad, did they earn it?" —
 * which network actually serves it is decided here, so the Android build
 * can swap in AdMob (with Meta bidding through mediation) without the game
 * screens changing.
 *
 * Modes:
 * - "adsense": AdSense H5 Games Ads (the Ad Placement API: adBreak/adConfig).
 *   Needs NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) and an approved site.
 * - "mock":    a fake full-screen ad drawn by us, for trying the flow on a
 *   preview deploy before any ad account exists. Also reachable on any
 *   deploy with `?ads=mock` in the URL (remembered for the tab).
 * - "off":     no ads at all. Between-level breaks are skipped and rewarded
 *   ads are reported unavailable, so the game behaves as it did before ads.
 *
 * Every call resolves — an ad that fails, never loads, or hangs can delay
 * the player by at most AD_LOAD_TIMEOUT_MS before the game carries on.
 */

export type AdMode = "adsense" | "mock" | "off";

export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
/** "on" serves AdSense test ads — use until the site is approved. */
export const ADSENSE_TEST_MODE = process.env.NEXT_PUBLIC_ADSENSE_TEST === "on";

/** Levels 1..N are ad-free; the first between-levels ad follows finishing level N. */
export const AD_FREE_LEVELS = 3;
/**
 * Never show two between-level ads closer together than this. AdSense also
 * paces adBreak itself (see data-ad-frequency-hint in the layout); this
 * floor keeps the mock and a future AdMob build honest the same way, and
 * stops quick early levels from turning into ad, level, ad.
 */
export const MIN_INTERSTITIAL_GAP_MS = 30 * 1000;
/** How long to wait for an ad to start before giving up and carrying on. */
const AD_LOAD_TIMEOUT_MS = 3 * 1000;
/** Hard cap on one ad break, in case the network never reports it finished. */
const AD_BREAK_MAX_MS = 60 * 1000;

const MODE_OVERRIDE_KEY = "arrowflow.adMode";
let lastInterstitialAt = 0;

/**
 * Remembers an `?ads=mock` / `?ads=off` override for the rest of the tab.
 * Called by any page the player can land on, so the override survives
 * tapping through to /play.
 */
export function rememberAdModeFromUrl(): void {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ads");
    if (fromUrl === "mock" || fromUrl === "off") window.sessionStorage.setItem(MODE_OVERRIDE_KEY, fromUrl);
  } catch {
    // storage blocked — the override just won't persist
  }
}

export function adMode(): AdMode {
  if (typeof window !== "undefined") {
    rememberAdModeFromUrl();
    try {
      const override = window.sessionStorage.getItem(MODE_OVERRIDE_KEY);
      if (override === "mock" || override === "off") return override;
    } catch {
      // storage blocked — fall through to the build-time mode
    }
  }
  const configured = process.env.NEXT_PUBLIC_ADS_MODE;
  if (configured === "adsense" || configured === "mock" || configured === "off") return configured;
  return ADSENSE_CLIENT ? "adsense" : "off";
}

/** Whether rewarded ads can be offered at all (hides "watch ad for…" extras when not). */
export function rewardedAdsAvailable(): boolean {
  return adMode() !== "off";
}

/**
 * The ad shown when the player moves on from a finished level. Resolves once
 * the ad is closed, skipped by the network, or timed out — always safe to
 * await before starting the next level.
 */
export async function showBetweenLevelsAd(completedLevel: number): Promise<void> {
  if (completedLevel < AD_FREE_LEVELS) return;
  if (Date.now() - lastInterstitialAt < MIN_INTERSTITIAL_GAP_MS) return;
  const mode = adMode();
  if (mode === "off") return;

  const shown = mode === "adsense" ? await adsenseInterstitial() : (await mockAd("interstitial")) === "closed";
  if (shown) lastInterstitialAt = Date.now();
}

/**
 * A rewarded ad the player opted into. Resolves true only if they watched it
 * through and earned the reward; false if they closed it early, none was
 * available, or ads are off.
 */
export async function showRewardedAd(placement: string): Promise<boolean> {
  const mode = adMode();
  if (mode === "off") return false;
  const earned = mode === "adsense" ? await adsenseRewarded(placement) : (await mockAd("rewarded")) === "earned";
  // A rewarded ad the player just sat through counts toward pacing too.
  if (earned) lastInterstitialAt = Date.now();
  return earned;
}

// ---------------------------------------------------------------------------
// AdSense H5 Games Ads
// ---------------------------------------------------------------------------

interface AdBreakPlacementInfo {
  breakStatus: string;
}

interface AdBreakOptions {
  type: "next" | "reward";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: AdBreakPlacementInfo) => void;
}

declare global {
  interface Window {
    adBreak?: (options: AdBreakOptions) => void;
  }
}

/** Resolves true if an ad actually played. */
function adsenseInterstitial(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.adBreak) return resolve(false);
    let started = false;
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(capTimer);
      resolve(played);
    };
    const loadTimer = setTimeout(() => {
      if (!started) finish(false);
    }, AD_LOAD_TIMEOUT_MS);
    const capTimer = setTimeout(() => finish(started), AD_BREAK_MAX_MS);

    window.adBreak({
      type: "next",
      name: "level_complete",
      beforeAd: () => {
        started = true;
      },
      // adBreakDone fires whether or not an ad showed (e.g. frequency-capped).
      adBreakDone: (info) => finish(started || info.breakStatus === "viewed"),
    });
  });
}

function adsenseRewarded(placement: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.adBreak) return resolve(false);
    let offered = false;
    let earned = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(capTimer);
      resolve(earned);
    };
    const loadTimer = setTimeout(() => {
      if (!offered) finish();
    }, AD_LOAD_TIMEOUT_MS);
    const capTimer = setTimeout(finish, AD_BREAK_MAX_MS);

    window.adBreak({
      type: "reward",
      name: placement,
      // The player already chose to watch by tapping our button, so start
      // the ad straight away rather than asking them a second time.
      beforeReward: (showAdFn) => {
        offered = true;
        showAdFn();
      },
      adViewed: () => {
        earned = true;
      },
      adDismissed: () => {
        earned = false;
      },
      adBreakDone: finish,
    });
  });
}

// ---------------------------------------------------------------------------
// Mock ads — a stand-in overlay so the flow can be tried before approval.
// ---------------------------------------------------------------------------

type MockOutcome = "closed" | "earned" | "skipped";

const MOCK_INTERSTITIAL_SECONDS = 3;
const MOCK_REWARDED_SECONDS = 5;

function mockAd(kind: "interstitial" | "rewarded"): Promise<MockOutcome> {
  return new Promise((resolve) => {
    const seconds = kind === "rewarded" ? MOCK_REWARDED_SECONDS : MOCK_INTERSTITIAL_SECONDS;
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Advertisement");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#111;color:#fff;font:600 15px system-ui,sans-serif;text-align:center;padding:24px";

    const label = document.createElement("div");
    label.textContent = kind === "rewarded" ? "Test rewarded ad" : "Test ad";
    label.style.cssText = "font-size:22px;font-weight:800";
    const countdown = document.createElement("div");
    countdown.style.opacity = "0.7";
    const button = document.createElement("button");
    button.style.cssText =
      "margin-top:8px;padding:10px 22px;border-radius:14px;border:1px solid #fff4;background:transparent;color:#fff;font:inherit";
    overlay.append(label, countdown, button);
    document.body.appendChild(overlay);

    let remaining = seconds;
    const done = (outcome: MockOutcome) => {
      clearInterval(timer);
      overlay.remove();
      resolve(outcome);
    };
    const render = () => {
      if (remaining > 0) {
        countdown.textContent =
          kind === "rewarded" ? `Reward in ${remaining}s` : `You can close this in ${remaining}s`;
        button.textContent = kind === "rewarded" ? "Skip (no reward)" : "Close";
        button.disabled = kind === "interstitial";
        button.style.opacity = button.disabled ? "0.4" : "1";
      } else {
        countdown.textContent = kind === "rewarded" ? "Reward earned" : "";
        button.textContent = "Close";
        button.disabled = false;
        button.style.opacity = "1";
      }
    };
    button.onclick = () => {
      if (kind === "rewarded") done(remaining > 0 ? "skipped" : "earned");
      else if (remaining <= 0) done("closed");
    };
    render();
    const timer = setInterval(() => {
      remaining -= 1;
      render();
    }, 1000);
  });
}
