import { PlayerProfile } from "@/lib/types";
import { levelFromXp } from "@/lib/scoring";
import { FlameIcon } from "./icons";

export function ProfileBadge({ profile }: { profile: PlayerProfile }) {
  const { level, xpIntoLevel, xpForNext } = levelFromXp(profile.xp);
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100));

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-panel ring-1 ring-white/10 px-4 py-3">
      <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-display font-extrabold text-white text-lg">
        {level}
      </div>
      <div className="flex-1 min-w-[8rem]">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-white/70 font-medium">Level {level}</span>
          <span className="text-white/40">
            {xpIntoLevel}/{xpForNext} XP
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-panel2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {profile.dailyStreak > 0 && (
        <div className="flex items-center gap-1 text-warn font-display font-bold text-sm shrink-0">
          <FlameIcon className="w-4 h-4" />
          {profile.dailyStreak}
        </div>
      )}
    </div>
  );
}
