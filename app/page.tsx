"use client";

import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { isDailyCompletedToday } from "@/lib/storage";
import { ProfileBadge } from "@/components/ProfileBadge";
import { ModeCard } from "@/components/ModeCard";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { FlameIcon, InfinityIcon, BoltIcon, StarIcon, TrophyIcon } from "@/components/icons";

export default function HomePage() {
  const { profile, hydrated } = usePlayerProfile();
  const dailyDone = hydrated && isDailyCompletedToday(profile);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent2 flex items-center justify-center">
            <BoltIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-white leading-none">ArrowFlow</h1>
            <p className="text-[11px] text-white/40 mt-0.5">Trace the path. Obey the arrows.</p>
          </div>
        </div>
      </header>

      <div className="mb-8">
        <ProfileBadge profile={profile} />
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <ModeCard
          href="/daily"
          title="Daily Puzzle"
          tagline="One fresh grid a day. Everyone gets the same one — keep your streak alive."
          icon={<FlameIcon className="w-5 h-5 text-warn" />}
          accentClass="bg-warn/15"
          stat={{ label: "Streak", value: `${profile.dailyStreak} day${profile.dailyStreak === 1 ? "" : "s"}` }}
          cta={dailyDone ? "Solved today ✓" : "Play"}
        />
        <ModeCard
          href="/endless"
          title="Endless"
          tagline="Puzzles keep coming and keep getting tougher. See how deep you can go."
          icon={<InfinityIcon className="w-5 h-5 text-accent2" />}
          accentClass="bg-accent2/15"
          stat={{ label: "Best Level", value: `${profile.endlessBestLevel}` }}
          cta="Play"
        />
        <ModeCard
          href="/challenge"
          title="Challenge"
          tagline="Race the clock. Solve as many puzzles as you can before time runs out."
          icon={<TrophyIcon className="w-5 h-5 text-accent" />}
          accentClass="bg-accent/15"
          stat={{ label: "Best score", value: `${profile.challengeHighScore}` }}
          cta="Play"
        />
      </div>

      <section className="rounded-2xl bg-panel ring-1 ring-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-white">Progress</h2>
          <span className="text-xs text-white/40">
            {profile.achievements.length}/{ACHIEVEMENTS.length} achievements
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5 text-center">
          <MiniStat value={profile.totalPuzzlesSolved} label="Puzzles solved" />
          <MiniStat value={profile.totalStars} label="Stars earned" icon={<StarIcon className="w-3.5 h-3.5 text-warn" />} />
          <MiniStat value={profile.threeStarClears} label="Flawless clears" />
        </div>
        <div className="flex flex-wrap gap-2">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = profile.achievements.includes(a.id);
            return (
              <div
                key={a.id}
                title={`${a.title} — ${a.description}`}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                  unlocked ? "bg-accent/20" : "bg-panel2/60 grayscale opacity-40"
                }`}
              >
                {a.icon}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-8 text-center text-xs text-white/30">
        Progress is saved on this device.
      </footer>
    </main>
  );
}

function MiniStat({ value, label, icon }: { value: number; label: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="font-display font-extrabold text-white text-xl flex items-center justify-center gap-1">
        {icon}
        {value}
      </div>
      <div className="text-[11px] text-white/40 mt-0.5">{label}</div>
    </div>
  );
}
