"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { generatePuzzleForLevel } from "@/lib/mazeGenerator";
import { applyLevelResult, grantLifeFromAd, loseLife } from "@/lib/storage";
import { LevelResult, Puzzle } from "@/lib/types";
import { ThemeStyle } from "@/components/ThemeStyle";
import { MazeGameView } from "@/components/MazeGameView";
import { PictureTile } from "@/components/PictureTile";
import { getPicture } from "@/lib/pictures";
import { PaletteIcon, SettingsIcon, TrophyIcon, StarIcon, WaterDropIcon } from "@/components/icons";

type Phase = "loading" | "playing" | "complete" | "outOfLives";

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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hydrated || puzzle) return;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    setPuzzle(generatePuzzleForLevel(profile.currentLevel, seed));
    setPhase(profile.lives > 0 ? "playing" : "outOfLives");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "outOfLives" && profile.lives > 0) setPhase("playing");
  }, [phase, profile.lives]);

  const handleMistake = useCallback(() => {
    const next = loseLife(profile);
    setProfile(next);
    if (next.lives <= 0) setPhase("outOfLives");
  }, [profile, setProfile]);

  const handleComplete = useCallback(
    (levelResult: LevelResult) => {
      setResult(levelResult);
      setProfile((p) => {
        const outcome = applyLevelResult(p, levelResult);
        setIsNewPicture(outcome.isNewPicture);
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
    setPhase(profile.lives > 0 ? "playing" : "outOfLives");
  };

  const watchAdForLife = () => {
    setProfile((p) => grantLifeFromAd(p));
  };

  return (
    <>
      <ThemeStyle themeId={profile.theme} />
      {/* dvh, not vh: on mobile the address bar would otherwise push the
          booster bar off the bottom of the screen. */}
      <main className="h-[100dvh] bg-outer flex flex-col">
        <div className="w-full max-w-sm mx-auto flex flex-col flex-1 min-h-0 px-4 py-4">
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
            <div className="flex gap-2 text-sub">
              <PaletteIcon className="w-4 h-4" />
              <SettingsIcon className="w-4 h-4" />
            </div>
          </div>

          {phase === "playing" && (
            <MazeGameView
              key={puzzle.id}
              puzzle={puzzle}
              lives={profile.lives}
              onMistake={handleMistake}
              onComplete={handleComplete}
            />
          )}

          {phase === "complete" && result && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
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
              <div className="flex gap-3 mt-1">
                <StatChip value={`+${result.coinsEarned}`} label="Coins" />
                <StatChip value={formatCountdown(result.elapsedMs)} label="Time" />
              </div>
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

          {phase === "outOfLives" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-maze">
                <WaterDropIcon className="w-7 h-7" style={{ color: "var(--danger)", opacity: 0.5 }} />
              </div>
              <h2 className="font-extrabold text-base text-text">Out of lives</h2>
              <p className="text-xs text-sub max-w-[220px] leading-relaxed">
                Wait for a life to refill, or watch a quick video to keep going right away.
              </p>
              {profile.nextLifeAt && (
                <p className="font-extrabold text-sm" style={{ color: "var(--accent2)" }}>
                  Next life in {formatCountdown(profile.nextLifeAt - now)}
                </p>
              )}
              <button
                onClick={watchAdForLife}
                className="w-full rounded-2xl py-3 font-bold text-sm mt-2"
                style={{ background: "var(--accent)", color: "var(--btn-text)" }}
              >
                Watch ad for +1 life
              </button>
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

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl px-4 py-2 text-center bg-maze min-w-[64px]">
      <div className="font-extrabold text-sm text-accent">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-sub2">{label}</div>
    </div>
  );
}
