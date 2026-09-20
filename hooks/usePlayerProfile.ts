"use client";

import { useEffect, useState } from "react";
import { PlayerProfile } from "@/lib/types";
import { defaultProfile, loadProfile, refillLives, saveProfile } from "@/lib/storage";

export function usePlayerProfile() {
  const [profile, setProfileState] = useState<PlayerProfile>(defaultProfile());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfileState(loadProfile());
    setHydrated(true);
  }, []);

  // Keep lives ticking up in the background while the app is open.
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      setProfileState((p) => refillLives(p));
    }, 1000);
    return () => clearInterval(id);
  }, [hydrated]);

  const setProfile = (updater: PlayerProfile | ((p: PlayerProfile) => PlayerProfile)) => {
    setProfileState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: PlayerProfile) => PlayerProfile)(prev) : updater;
      saveProfile(next);
      return next;
    });
  };

  return { profile, hydrated, setProfile };
}
