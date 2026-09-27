"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { generatePuzzleForLevel } from "@/lib/mazeGenerator";
import { applyLevelResult, setTheme } from "@/lib/storage";
import { LevelResult, Puzzle } from "@/lib/types";
import { ThemeStyle } from "@/components/ThemeStyle";
import { MazeGameView } from "@/components/MazeGameView";
import { PaperPop } from "@/components/PaperPop";
import { ThemePicker } from "@/components/ThemePicker";
import { PictureTile } from "@/components/PictureTile";
import { getPicture } from "@/lib/pictures";
import { PaletteIcon, SettingsIcon, SoundOffIcon, SoundOnIcon, TrophyIcon, StarIcon, WaterDropIcon } from "@/components/icons";
import { setSoundEnabled } from "@/lib/sound";

type Phase = "loading" | "playing" | "complete" | "failed";

/**
 * Below this, a level that runs out of lives simply offers another go.
 *
 * Nobody learning the rule should be shown a commercial while they do it,
 * and a beginner's blocked taps are how they find out what "blocked" means.
 */
const AD_FROM_LEVEL = 10;

/** Finishing inside this earns a mention on the end card. */
const QUICK_LEVEL_MS = 60_000;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayPage() {
  const router = useRouter();
  const { profile, hydrated, setProfile } = usePlayerProfile();
  const [phase, setPhase] = useState<Phase>("loading");
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [isNewPicture, setIsNewPicture] = useState(false);
  const [isBestTime, setIsBestTime] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  useEffect(() => {
    if (!hydrated || puzzle) return;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    setPuzzle(generatePuzzleForLevel(profile.currentLevel, seed));
    setPhase("playing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // A profile saved before sound existed has no setting, and reads as on.
  const soundOn = profile.soundEnabled !== false;
  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  // Lives belong to the level and are counted inside the game itself, so a
  // blocked tap needs nothing from the page beyond the sound and shake the
  // board already does.
  const handleMistake = useCallback(() => {}, []);

  // Held so the "one more go" button can put a life back into the level that
  // is still on screen, rather than dealing a new board.
  const grantExtraLifeRef = useRef<(() => void) | null>(null);
  const handleOutOfLives = useCallback((offerExtraLife: () => void) => {
    grantExtraLifeRef.current = offerExtraLife;
    setPhase("failed");
  }, []);

  const handleComplete = useCallback(
    (levelResult: LevelResult) => {
      setResult(levelResult);
      setProfile((p) => {
        const outcome = applyLevelResult(p, levelResult);
        setIsNewPicture(outcome.isNewPicture);
        setIsBestTime(outcome.isBestTime);
        return outcome.profile;
      });
      setPhase("complete");
    },
    [setProfile]
  );

  if (!hydrated || !puzzle) {
    return (
      <>
        <ThemeStyle themeId={profile.theme} />
        <main className="min-h-screen bg-outer flex items-center justify-center">
          <p className="text-sub text-sm">Building maze&hellip;</p>
        </main>
      </>
    );
  }

  const completedPicture = result?.pictureId ? getPicture(result.pictureId) : undefined;

  const startNextLevel = () => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    setPuzzle(generatePuzzleForLevel(profile.currentLevel, seed));
    setResult(null);
    setPhase("playing");
  };

  /** A fresh board for the same level. */
  const retryLevel = () => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    setPuzzle(generatePuzzleForLevel(puzzle.level, seed));
    setResult(null);
    setPhase("playing");
  };

  /** One more life on the board already in progress. */
  const continueWithExtraLife = () => {
    grantExtraLifeRef.current?.();
    setPhase("playing");
  };

  return (
    <>
      <ThemeStyle themeId={profile.theme} />
      {/* dvh, not vh: on mobile the address bar would otherwise push the
          booster bar off the bottom of the screen. */}
      <main className="h-[100dvh] bg-outer flex flex-col">
        <div className="w-full max-w-xl mx-auto flex flex-col flex-1 min-h-0 px-3 py-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => router.push("/")} aria-label="Back to home" className="text-sub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="text-center">
              <div className="font-extrabold text-base text-accent">Level {puzzle.level}</div>
              <div className="font-extrabold text-[11px] uppercase tracking-wide" style={{ color: "var(--accent2)" }}>
                {puzzle.tier}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sub">
              <button
                type="button"
                onClick={() => setProfile((p) => ({ ...p, soundEnabled: !soundOn }))}
                aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
                aria-pressed={soundOn}
                // Comfortably tappable without making the header heavy: the
                // padding is the target, the icon stays small.
                className="-m-2 p-2"
              >
                {soundOn ? <SoundOnIcon className="w-4 h-4" /> : <SoundOffIcon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowThemes((s) => !s)}
                aria-label="Change theme"
                aria-expanded={showThemes}
                className="-m-2 p-2"
              >
                <PaletteIcon className="w-4 h-4" />
              </button>
              <SettingsIcon className="w-4 h-4" />
            </div>
          </div>

          {/* Over the board, not instead of it: a theme is chosen by looking
              at the maze, and the level underneath carries on waiting. */}
          {showThemes && (
            <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center">
              <button
                type="button"
                aria-label="Close theme picker"
                onClick={() => setShowThemes(false)}
                className="absolute inset-0 bg-black/25"
              />
              <div data-testid="theme-sheet" className="relative w-full max-w-sm m-3 rounded-3xl bg-panel p-5 shadow-xl">
                <h2 className="font-extrabold text-sm text-text text-center mb-3">Theme</h2>
                <ThemePicker
                  current={profile.theme}
                  onSelect={(id) => setProfile((p) => setTheme(p, id))}
                />
                <button
                  onClick={() => setShowThemes(false)}
                  className="w-full rounded-2xl py-3 font-bold text-sm mt-4"
                  style={{ background: "var(--accent)", color: "var(--btn-text)" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {phase === "playing" && (
            <MazeGameView
              key={puzzle.id}
              puzzle={puzzle}
              onMistake={handleMistake}
              onComplete={handleComplete}
              onOutOfLives={handleOutOfLives}
            />
          )}

          {phase === "complete" && result && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <PaperPop seed={result.level * 7919 + result.coinsEarned} />
              {completedPicture ? (
                <>
                  <div className="rounded-2xl bg-maze p-4 flex items-center justify-center">
                    <PictureTile picture={completedPicture} size={132} />
                  </div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-lg text-text">{completedPicture.name}</h2>
                    {isNewPicture && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                        style={{ background: "var(--accent3)", color: "var(--btn-text)" }}
                      >
                        New
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center bg-maze"
                    style={{ border: "3px solid var(--accent3)", color: "var(--accent3)" }}
                  >
                    <TrophyIcon className="w-9 h-9" />
                  </div>
                  <h2 className="font-extrabold text-lg text-text">Level Complete!</h2>
                </>
              )}
              <div className="flex gap-1" style={{ color: "var(--accent3)" }}>
                {[1, 2, 3].map((n) => (
                  <StarIcon key={n} filled={n <= result.stars} className="w-6 h-6" />
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <StatChip value={formatCountdown(result.elapsedMs)} label="Time" />
                <StatChip value={String(result.piecesCleared)} label="Lines" />
                <StatChip value={String(result.bestStreak)} label="Best run" />
                <StatChip value={`+${result.coinsEarned}`} label="Coins" />
              </div>
              {/* Whatever was notable about this particular run. Nothing is
                  shown when nothing was, rather than padding the card with
                  "0 mistakes" on a run that had three. */}
              <div className="flex flex-wrap justify-center gap-1.5 max-w-[280px]">
                {isBestTime && <Badge>New best time</Badge>}
                {result.elapsedMs < QUICK_LEVEL_MS && <Badge>Under a minute</Badge>}
                {result.mistakes === 0 && <Badge>No mistakes</Badge>}
                {result.hintsUsed === 0 && <Badge>No hints</Badge>}
                {result.bestStreak >= 10 && <Badge>{result.bestStreak} in a row</Badge>}
              </div>
              <p className="text-[11px] text-sub2">
                {(profile.totalPiecesCleared ?? 0).toLocaleString()} lines cleared in all
              </p>
              <button
                onClick={startNextLevel}
                className="w-full rounded-2xl py-3 font-bold text-sm mt-3"
                style={{ background: "var(--accent)", color: "var(--btn-text)" }}
              >
                Level {puzzle.level + 1} &rarr;
              </button>
              <button onClick={() => router.push("/")} className="text-sub2 font-semibold text-xs py-2">
                Back to Home
              </button>
            </div>
          )}

          {phase === "failed" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-maze">
                <WaterDropIcon className="w-7 h-7" style={{ color: "var(--danger)", opacity: 0.5 }} />
              </div>
              <h2 className="font-extrabold text-base text-text">Out of lives</h2>
              <p className="text-xs text-sub max-w-[230px] leading-relaxed">
                That is this level over — nothing else is locked. Take it again from the top,
                or carry on with the board you were on.
              </p>
              <button
                onClick={retryLevel}
                className="w-full rounded-2xl py-3 font-bold text-sm mt-2"
                style={{ background: "var(--accent)", color: "var(--btn-text)" }}
              >
                Try level {puzzle.level} again
              </button>
              {/* Offered only once the player is well past learning the rule. */}
              {puzzle.level >= AD_FROM_LEVEL && (
                <button
                  onClick={continueWithExtraLife}
                  className="w-full rounded-2xl py-3 font-bold text-sm"
                  style={{ border: "2px solid var(--accent)", color: "var(--accent)" }}
                >
                  Watch ad to keep this board
                </button>
              )}
              <button onClick={() => router.push("/")} className="text-sub2 font-semibold text-xs py-2">
                Back to Home
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/** One thing worth saying about the run just played. */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ background: "var(--chip)", color: "var(--accent)" }}
    >
      {children}
    </span>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center bg-maze min-w-[58px]">
      <div className="font-extrabold text-sm text-accent">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-sub2">{label}</div>
    </div>
  );
}
