"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { setTheme } from "@/lib/storage";
import { ThemeStyle } from "@/components/ThemeStyle";
import { ThemePicker } from "@/components/ThemePicker";
import { BoltIcon, PaletteIcon, SettingsIcon } from "@/components/icons";
import { PictureTile } from "@/components/PictureTile";
import { PICTURES } from "@/lib/pictures";
import { ThemeId } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { profile, hydrated, setProfile } = usePlayerProfile();
  const [showThemes, setShowThemes] = useState(false);
  const collected = profile.collectedPictures ?? [];

  const handleThemeSelect = (id: ThemeId) => {
    setProfile((p) => setTheme(p, id));
  };

  return (
    <>
      <ThemeStyle themeId={profile.theme} />
      <main className="min-h-screen bg-outer flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm flex flex-col flex-1">
          <div className="flex items-center gap-2.5 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <BoltIcon className="w-4 h-4 text-btntext" />
            </div>
            <span className="font-bold text-lg text-text">ArrowFlow</span>
          </div>

          <div className="flex justify-center gap-8 mb-6">
            <Stat label="Coins" value={hydrated ? profile.coins.toLocaleString() : "–"} />
            <Stat label="Stars" value={hydrated ? profile.totalStars.toLocaleString() : "–"} />
            <Stat label="Found" value={hydrated ? `${collected.length}/${PICTURES.length}` : "–"} />
          </div>

          <div className="mb-6">
            <div className="grid grid-cols-4 gap-2">
              {PICTURES.map((picture) => {
                const found = collected.includes(picture.id);
                return (
                  <div
                    key={picture.id}
                    className="aspect-square rounded-xl bg-maze flex items-center justify-center"
                    style={found ? undefined : { opacity: 0.55 }}
                    title={found ? picture.name : "Not found yet"}
                  >
                    <PictureTile picture={picture} size={38} locked={!found} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-28 h-28 rounded-3xl flex flex-col items-center justify-center bg-maze"
              style={{ border: "3px solid var(--accent)" }}
            >
              <span className="text-3xl font-extrabold text-accent">{hydrated ? profile.currentLevel : "–"}</span>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent2)" }}>
                Level
              </span>
            </div>
            <button
              onClick={() => router.push("/play")}
              disabled={!hydrated}
              className="w-full rounded-2xl py-3.5 font-bold text-base disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--btn-text)" }}
            >
              Play
            </button>
          </div>

          {showThemes && (
            <div className="mb-4 p-4 rounded-2xl bg-panel">
              <ThemePicker current={profile.theme} onSelect={handleThemeSelect} />
            </div>
          )}

          <div className="flex justify-between mt-4">
            <IconButton onClick={() => setShowThemes((s) => !s)} label="Change theme">
              <PaletteIcon className="w-4 h-4" />
            </IconButton>
            <IconButton label="Settings">
              <SettingsIcon className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-extrabold text-sm text-accent">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-sub2">{label}</div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-9 h-9 rounded-xl flex items-center justify-center bg-maze text-sub"
    >
      {children}
    </button>
  );
}
